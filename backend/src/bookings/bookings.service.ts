import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Booking, BookingStatus, Service, User } from '../entities';
import { CreateBookingDto, UpdateBookingStatusDto } from './dto/booking.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { reservaVisible } from './partes-visibles';
import { comprobarMismoMundo } from '../common/demostracion';
import {
  comprobarFechaNueva,
  comprobarQueHaLlegado,
  comprobarQueNoHaPasado,
  errorDeSolape,
  esSolape,
} from '../common/calendario';
import { NotificationType } from '../entities';

/**
 * Qué aviso corresponde a cada estado, y a quién.
 *
 * «destino» dice a cuál de las dos partes se avisa: al cliente cuando el
 * profesional decide, y al profesional cuando el cliente cancela. Avisar al
 * que acaba de pulsar el botón sería contarle lo que ya sabe.
 */
const AVISO_POR_ESTADO: Partial<
  Record<
    BookingStatus,
    { tipo: NotificationType; destino: 'cliente' | 'profesional' }
  >
> = {
  [BookingStatus.CONFIRMED]: {
    tipo: NotificationType.BOOKING_CONFIRMED,
    destino: 'cliente',
  },
  [BookingStatus.REJECTED]: {
    tipo: NotificationType.BOOKING_CANCELLED,
    destino: 'cliente',
  },
  [BookingStatus.COMPLETED]: {
    tipo: NotificationType.BOOKING_COMPLETED,
    destino: 'cliente',
  },
  [BookingStatus.CANCELLED]: {
    tipo: NotificationType.BOOKING_CANCELLED,
    destino: 'profesional',
  },
};

/**
 * Comprueba que el importe cae dentro de la tarifa que publica el servicio.
 *
 * El cliente elige dentro de la horquilla, que es lo que enseña la ficha, y
 * eso está bien: lo que no puede es elegir fuera. Sin máximo publicado, el
 * mínimo es el suelo y por arriba no hay tope, porque pagar de más es
 * decisión de quien paga.
 *
 * Un máximo por debajo del mínimo se ignora en vez de rechazarse. Es una
 * horquilla imposible —ningún importe la cumple— y aplicarla dejaría el
 * servicio sin forma de contratarse. Se publicaron así porque el formulario
 * no lo impedía; ya lo impide, pero los que quedaran tienen que seguir
 * funcionando.
 */
function comprobarPrecio(servicio: Service, propuesto: number): number {
  const minimo = Number(servicio.priceMin);
  const maximo = servicio.priceMax === null ? null : Number(servicio.priceMax);

  if (propuesto < minimo) {
    throw new BadRequestException(
      `El importe no puede ser inferior a ${minimo} euros`,
    );
  }

  if (maximo !== null && maximo > minimo && propuesto > maximo) {
    throw new BadRequestException(
      `El importe no puede superar los ${maximo} euros`,
    );
  }

  return propuesto;
}

/** Quién pregunta por una reserva. */
export interface Solicitante {
  id: string;
  role: string;
}

/** Las dos partes de la reserva, y la moderación. Nadie más. */
const puedeVerla = (reserva: Booking, quien: Solicitante): boolean =>
  reserva.clientId === quien.id ||
  reserva.providerId === quien.id ||
  quien.role === 'admin';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly avisos: NotificationsService,
    private readonly pagos: PaymentsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    clientId: string,
    createDto: CreateBookingDto,
  ): Promise<Booking> {
    const scheduledDate = new Date(createDto.scheduledDate);
    comprobarFechaNueva(scheduledDate);

    const service = await this.serviceRepository.findOne({
      where: { id: createDto.serviceId, isActive: true },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado o no disponible');
    }

    if (service.providerId === clientId) {
      throw new BadRequestException('No puedes reservar tu propio servicio');
    }

    const partes = await this.userRepository.find({
      where: { id: In([clientId, service.providerId]) },
      select: { id: true, esDemostracion: true },
    });
    const cliente = partes.find((parte) => parte.id === clientId);
    const profesional = partes.find((parte) => parte.id === service.providerId);
    if (!cliente || !profesional) {
      throw new NotFoundException('Servicio no encontrado o no disponible');
    }
    comprobarMismoMundo(cliente, profesional);

    // El importe llegaba con un @Min(0) por toda comprobación, y ese número
    // era el que acababa cobrándose en Stripe: un servicio de 500 euros se
    // reservaba por cincuenta céntimos. Con cero, además, Stripe rechazaba el
    // importe y la API devolvía un 500. La horquilla la publica el servicio,
    // así que es el servicio quien dice si la cifra vale.
    const totalPrice = comprobarPrecio(service, createDto.totalPrice);

    // Pedir un hueco que el profesional ya tiene comprometido es pedir algo
    // que nunca va a poder aceptar: se dice ahora, no cuando lo intente.
    if (
      await this.horarioOcupado(
        service.providerId,
        scheduledDate,
        service.durationMinutes,
      )
    ) {
      throw errorDeSolape();
    }

    const booking = this.bookingRepository.create({
      clientId,
      serviceId: createDto.serviceId,
      providerId: service.providerId,
      scheduledDate,
      durationMinutes: service.durationMinutes,
      description: createDto.description,
      totalPrice,
      status: BookingStatus.PENDING,
    });

    const guardada = await this.bookingRepository.save(booking);

    // El profesional se enteraba de las solicitudes nuevas recargando su
    // bandeja: el aviso existía en el catálogo y nadie lo enviaba.
    await this.avisos.crear({
      usuarioId: service.providerId,
      tipo: NotificationType.BOOKING_REQUEST,
      enlace: `/dashboard/bookings/${guardada.id}`,
    });

    return guardada;
  }

  /**
   * Si el profesional ya tiene una reserva confirmada que se pisa con esta.
   *
   * Al pedir una reserva, orienta; al confirmarla, rechaza. Pero la que
   * decide es la restricción de la base, la única que ve dos confirmaciones
   * simultáneas: cada una bloquea solo su fila y ninguna ve a la otra.
   */
  private async horarioOcupado(
    providerId: string,
    inicio: Date,
    minutos: number,
    reservas: Repository<Booking> = this.bookingRepository,
  ): Promise<boolean> {
    const fin = new Date(inicio.getTime() + minutos * 60_000);
    return reservas
      .createQueryBuilder('reserva')
      .where('reserva.providerId = :providerId', { providerId })
      .andWhere('reserva.status = :confirmada', {
        confirmada: BookingStatus.CONFIRMED,
      })
      .andWhere(
        `tsrange(reserva.scheduledDate, reserva.scheduledDate + reserva.durationMinutes * interval '1 minute') && tsrange(CAST(:inicio AS timestamp), CAST(:fin AS timestamp))`,
        { inicio, fin },
      )
      .getExists();
  }

  /**
   * Una reserva solo la ven sus dos partes, y la moderación.
   *
   * Antes bastaba con conocer el identificador: la ruta no recibía al
   * usuario. Y esos identificadores no había ni que adivinarlos, porque la
   * API pública de valoraciones los devolvía en cada reseña. Dentro va el
   * domicilio de la persona, la fecha y el importe.
   */
  async findById(id: string, quien?: Solicitante): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: {
        client: true,
        provider: true,

        service: {
          category: true,
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (quien && !puedeVerla(booking, quien)) {
      throw new ForbiddenException('Esta reserva no es tuya');
    }

    return booking;
  }

  /** Lo que devuelve la API al pedir una reserva: ver partes-visibles.ts. */
  async verReserva(id: string, quien: Solicitante): Promise<Booking> {
    return reservaVisible(await this.findById(id, quien));
  }

  async updateStatus(
    id: string,
    userId: string,
    userRole: string,
    updateDto: UpdateBookingStatusDto,
  ): Promise<Booking> {
    const newStatus = updateDto.status;
    const sinCobro = updateDto.sinCobro === true;

    // Todo en una transacción, con la fila de la reserva bloqueada.
    //
    // Antes se leía la reserva, se movía el dinero y se guardaba después,
    // sin bloqueo. Si el profesional completaba mientras el cliente
    // cancelaba, las dos validaban la transición contra el mismo estado:
    // una cobraba y la otra dejaba la reserva cancelada con el dinero
    // cobrado. Con el bloqueo, la segunda espera y vuelve a validar contra
    // lo que dejó la primera.
    await this.dataSource.transaction(async (gestor) => {
      const booking = await gestor.findOne(Booking, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) {
        throw new NotFoundException('Reserva no encontrada');
      }

      this.validateStatusTransition(booking, newStatus, userId, userRole);

      // La restricción de la base es la que ve dos confirmaciones a la vez;
      // esto da el mismo rechazo sin depender de ella, que una base sin
      // btree_gist no tiene (ver CalendarioReservas).
      if (
        newStatus === BookingStatus.CONFIRMED &&
        (await this.horarioOcupado(
          booking.providerId,
          booking.scheduledDate,
          booking.durationMinutes,
          gestor.getRepository(Booking),
        ))
      ) {
        throw errorDeSolape();
      }

      // El dinero se mueve ANTES de dar por bueno el estado. Si el cobro
      // falla, la reserva no se marca completada: un trabajo cerrado sin
      // cobrar no lo vuelve a mirar nadie. Liberar, en cambio, nunca
      // bloquea —quien cancela tiene derecho a cancelar— y eso lo decide el
      // servicio de pagos, no esta línea.
      if (newStatus === BookingStatus.COMPLETED) {
        await this.pagos.cobrarAlCompletar(booking.id, { gestor, sinCobro });
      } else if (
        newStatus === BookingStatus.CANCELLED ||
        newStatus === BookingStatus.REJECTED
      ) {
        await this.pagos.liberarRetencion(booking.id, gestor);
      }

      booking.status = newStatus;

      if (newStatus === BookingStatus.CONFIRMED) {
        booking.confirmedAt = new Date();
      } else if (newStatus === BookingStatus.COMPLETED) {
        booking.completedAt = new Date();
      } else if (
        newStatus === BookingStatus.CANCELLED ||
        newStatus === BookingStatus.REJECTED
      ) {
        booking.cancelledAt = new Date();
        booking.cancellationReason = updateDto.cancellationReason || null;
      }

      try {
        await gestor.save(booking);
      } catch (error) {
        // Otra reserva confirmada del mismo profesional ocupa ese horario.
        if (esSolape(error)) throw errorDeSolape();
        throw error;
      }
    });

    // Con sus relaciones, que la fila bloqueada no podía traer: PostgreSQL
    // no bloquea el lado opcional de una unión externa.
    const guardada = await this.findById(id);
    await this.avisar(guardada, newStatus, userId, sinCobro);
    return reservaVisible(guardada);
  }

  /**
   * Avisa a la otra parte del cambio de estado.
   *
   * Hasta ahora no se avisaba a nadie: un cliente cuya reserva aceptaban se
   * enteraba recargando la página. El aviso no puede hacer fallar el cambio
   * de estado, así que el servicio de avisos no lanza nunca.
   */
  private async avisar(
    reserva: Booking,
    estado: BookingStatus,
    actorId: string,
    sinCobro = false,
  ): Promise<void> {
    const aviso = AVISO_POR_ESTADO[estado];
    if (!aviso) return;

    // Cancelar pueden las dos partes, y el aviso iba siempre al profesional:
    // si cancelaba él, se avisaba a sí mismo y el cliente se presentaba sin
    // saberlo. Va a la otra parte, y a las dos si cancela la moderación.
    const destinos =
      estado === BookingStatus.CANCELLED
        ? [reserva.clientId, reserva.providerId].filter((id) => id !== actorId)
        : [aviso.destino === 'cliente' ? reserva.clientId : reserva.providerId];

    for (const usuarioId of destinos) {
      await this.avisos.crear({
        usuarioId,
        tipo: aviso.tipo,
        datos: sinCobro ? { estado, sinCobro: 'si' } : { estado },
        enlace: `/dashboard/bookings/${reserva.id}`,
      });
    }
  }

  async findByClient(clientId: string): Promise<Booking[]> {
    const reservas = await this.bookingRepository.find({
      where: { clientId },
      relations: {
        service: {
          category: true,
        },

        provider: true,
      },
      order: { createdAt: 'DESC' },
    });
    return reservas.map(reservaVisible);
  }

  async findByProvider(providerId: string): Promise<Booking[]> {
    const reservas = await this.bookingRepository.find({
      where: { providerId },
      relations: {
        service: {
          category: true,
        },

        client: true,
      },
      order: { createdAt: 'DESC' },
    });
    return reservas.map(reservaVisible);
  }

  private validateStatusTransition(
    booking: Booking,
    newStatus: BookingStatus,
    userId: string,
    userRole: string,
  ): void {
    const validTransitions: Record<BookingStatus, BookingStatus[]> = {
      [BookingStatus.PENDING]: [
        BookingStatus.CONFIRMED,
        BookingStatus.REJECTED,
        BookingStatus.CANCELLED,
      ],
      [BookingStatus.CONFIRMED]: [
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED,
      ],
      [BookingStatus.COMPLETED]: [],
      [BookingStatus.CANCELLED]: [],
      [BookingStatus.REJECTED]: [],
    };

    if (!validTransitions[booking.status]?.includes(newStatus)) {
      throw new BadRequestException(
        `No se puede cambiar de "${booking.status}" a "${newStatus}"`,
      );
    }

    // El proveedor confirma, completa o rechaza
    if (
      [
        BookingStatus.CONFIRMED,
        BookingStatus.COMPLETED,
        BookingStatus.REJECTED,
      ].includes(newStatus)
    ) {
      if (booking.providerId !== userId && userRole !== 'admin') {
        throw new ForbiddenException(
          'Solo el proveedor puede realizar esta acción',
        );
      }
    }

    // El cliente cancela
    if (newStatus === BookingStatus.CANCELLED) {
      if (
        booking.clientId !== userId &&
        booking.providerId !== userId &&
        userRole !== 'admin'
      ) {
        throw new ForbiddenException(
          'No tienes permisos para cancelar esta reserva',
        );
      }
    }

    // Las fechas, después de los permisos: a quien no puede tocar la
    // reserva no se le cuenta nada de ella.
    if (newStatus === BookingStatus.CONFIRMED) {
      comprobarQueNoHaPasado(booking.scheduledDate);
    } else if (newStatus === BookingStatus.COMPLETED) {
      // Antes se podía completar, y con ello cobrar, un trabajo de la
      // semana que viene.
      comprobarQueHaLlegado(booking.scheduledDate);
    }
  }
}
