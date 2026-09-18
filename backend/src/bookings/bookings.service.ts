import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus, Service } from '../entities';
import { CreateBookingDto, UpdateBookingStatusDto } from './dto/booking.dto';
import { NotificationsService } from '../notifications/notifications.service';
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

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    private readonly avisos: NotificationsService,
  ) {}

  async create(
    clientId: string,
    createDto: CreateBookingDto,
  ): Promise<Booking> {
    const service = await this.serviceRepository.findOne({
      where: { id: createDto.serviceId, isActive: true },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado o no disponible');
    }

    if (service.providerId === clientId) {
      throw new BadRequestException('No puedes reservar tu propio servicio');
    }

    const booking = this.bookingRepository.create({
      clientId,
      serviceId: createDto.serviceId,
      providerId: service.providerId,
      scheduledDate: new Date(createDto.scheduledDate),
      description: createDto.description,
      totalPrice: createDto.totalPrice,
      status: BookingStatus.PENDING,
    });

    return this.bookingRepository.save(booking);
  }

  async findById(id: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['client', 'provider', 'service', 'service.category'],
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    return booking;
  }

  async updateStatus(
    id: string,
    userId: string,
    userRole: string,
    updateDto: UpdateBookingStatusDto,
  ): Promise<Booking> {
    const booking = await this.findById(id);
    const newStatus = updateDto.status as BookingStatus;

    this.validateStatusTransition(booking, newStatus, userId, userRole);

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

    const guardada = await this.bookingRepository.save(booking);
    await this.avisar(guardada, newStatus);
    return guardada;
  }

  /**
   * Avisa a la otra parte del cambio de estado.
   *
   * Hasta ahora no se avisaba a nadie: un cliente cuya reserva aceptaban se
   * enteraba recargando la página. El aviso no puede hacer fallar el cambio
   * de estado, así que el servicio de avisos no lanza nunca.
   */
  private async avisar(reserva: Booking, estado: BookingStatus): Promise<void> {
    const aviso = AVISO_POR_ESTADO[estado];
    if (!aviso) return;

    await this.avisos.crear({
      usuarioId:
        aviso.destino === 'cliente' ? reserva.clientId : reserva.providerId,
      tipo: aviso.tipo,
      datos: { estado },
      enlace: `/dashboard/bookings/${reserva.id}`,
    });
  }

  async findByClient(clientId: string): Promise<Booking[]> {
    return this.bookingRepository.find({
      where: { clientId },
      relations: ['service', 'service.category', 'provider'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByProvider(providerId: string): Promise<Booking[]> {
    return this.bookingRepository.find({
      where: { providerId },
      relations: ['service', 'service.category', 'client'],
      order: { createdAt: 'DESC' },
    });
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
  }
}
