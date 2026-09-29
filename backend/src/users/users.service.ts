import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  AccionAuditada,
  Booking,
  BookingStatus,
  Conversation,
  Message,
  Notification,
  Payment,
  RestablecimientoContrasena,
  Review,
  Service,
  User,
  UserRole,
} from '../entities';
import { AuditoriaService, type Actor } from '../auditoria/auditoria.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { puntoGeografico } from '../common/geografia';
import {
  CODIGO_CONTRASENA_INCORRECTA,
  CODIGO_CUENTA_CON_RESERVAS,
  comprobarQueNoEsDeDemostracion,
  segundoActual,
} from '../common/cuenta';
import { PaymentsService } from '../payments/payments.service';
import { TOPE_ADMINISTRACION } from '../common/topes';

/** Reservas que todavía comprometen a alguien. */
const ABIERTAS = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly auditoria: AuditoriaService,
    private readonly dataSource: DataSource,
    private readonly pagos: PaymentsService,
  ) {}

  /** Con `soloDemostracion`, las de la demostración: ver soloVeLaDemostracion. */
  async findAll({
    soloDemostracion = false,
  }: { soloDemostracion?: boolean } = {}): Promise<User[]> {
    return this.userRepository.find({
      where: soloDemostracion ? { esDemostracion: true } : undefined,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        phone: true,
        bio: true,
        city: true,
        isActive: true,
        createdAt: true,
      },
      order: { createdAt: 'DESC' },
      take: TOPE_ADMINISTRACION,
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async update(id: string, updateDto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);

    if (updateDto.latitude !== undefined && updateDto.longitude !== undefined) {
      user.location = puntoGeografico(updateDto.latitude, updateDto.longitude);
    }

    const { latitude, longitude, ...rest } = updateDto;
    Object.assign(user, rest);

    return this.userRepository.save(user);
  }

  async toggleActive(id: string, actor: Actor): Promise<User> {
    const idSolicitante = actor.id;
    // Desactivarse a uno mismo es un viaje sin billete de vuelta: la
    // estrategia JWT rechaza a los usuarios inactivos y esta misma ruta exige
    // un administrador activo, así que con un solo administrador la
    // plataforma queda cerrada hasta que alguien entre por la base de datos.
    if (id === idSolicitante) {
      throw new BadRequestException(
        'No puedes desactivar tu propia cuenta de administración.',
      );
    }

    const user = await this.findById(id);
    // Reactivarla devolvería una cáscara vacía con una contraseña que no
    // conoce nadie: su titular la eliminó.
    if (user.eliminadaEn) {
      throw new ConflictException(
        'Esta cuenta la eliminó su titular: no se puede reactivar.',
      );
    }

    user.isActive = !user.isActive;
    const guardado = await this.userRepository.save(user);

    // Se anota el correo de la persona afectada además de su identificador:
    // un historial que solo tiene identificadores obliga a cruzarlo con
    // filas que quizá ya no existan.
    await this.auditoria.anotar({
      actor,
      accion: guardado.isActive
        ? AccionAuditada.USUARIO_ACTIVADO
        : AccionAuditada.USUARIO_DESACTIVADO,
      entidad: 'usuario',
      entidadId: guardado.id,
      contexto: { email: guardado.email },
    });

    return guardado;
  }

  /**
   * Todo lo que la plataforma guarda de una persona, en un fichero que se
   * puede leer y llevar a otra parte.
   *
   * La política de privacidad prometía el acceso y la portabilidad, y la
   * única forma de ejercerlos era escribir al autor. De la otra parte de
   * cada reserva o conversación sale solo el nombre de pila: sus datos son
   * suyos, no de quien descarga.
   */
  async exportarDatos(usuarioId: string): Promise<Record<string, unknown>> {
    const consulta = this.dataSource.manager;
    const cuenta = await this.findById(usuarioId);

    const [servicios, comoCliente, comoProfesional, pagos, escritas] =
      await Promise.all([
        consulta.find(Service, {
          where: { providerId: usuarioId },
          order: { createdAt: 'ASC' },
        }),
        consulta.find(Booking, {
          where: { clientId: usuarioId },
          relations: { service: true, provider: true },
          order: { createdAt: 'ASC' },
        }),
        consulta.find(Booking, {
          where: { providerId: usuarioId },
          relations: { service: true, client: true },
          order: { createdAt: 'ASC' },
        }),
        consulta.find(Payment, {
          where: { clientId: usuarioId },
          order: { createdAt: 'ASC' },
        }),
        consulta.find(Review, {
          where: { clientId: usuarioId },
          relations: { service: true },
          order: { createdAt: 'ASC' },
        }),
      ]);

    const recibidas = servicios.length
      ? await consulta.find(Review, {
          where: { serviceId: In(servicios.map((s) => s.id)) },
          relations: { service: true, client: true },
          order: { createdAt: 'ASC' },
        })
      : [];

    const conversaciones = await consulta.find(Conversation, {
      where: [{ participantOneId: usuarioId }, { participantTwoId: usuarioId }],
      relations: { participantOne: true, participantTwo: true },
      order: { createdAt: 'ASC' },
    });
    const mensajes = conversaciones.length
      ? await consulta.find(Message, {
          where: { conversationId: In(conversaciones.map((c) => c.id)) },
          order: { createdAt: 'ASC' },
        })
      : [];

    const avisos = await consulta.find(Notification, {
      where: { userId: usuarioId },
      order: { createdAt: 'ASC' },
    });

    const reserva = (b: Booking, otraParte: User | undefined) => ({
      id: b.id,
      servicio: b.service?.title ?? null,
      otraParte: otraParte?.firstName ?? null,
      estado: b.status,
      fecha: b.scheduledDate,
      duracionMinutos: b.durationMinutes,
      importe: b.totalPrice,
      descripcion: b.description,
      motivoCancelacion: b.cancellationReason,
      confirmada: b.confirmedAt,
      completada: b.completedAt,
      cancelada: b.cancelledAt,
      creada: b.createdAt,
    });

    return {
      generado: new Date().toISOString(),
      cuenta: {
        id: cuenta.id,
        email: cuenta.email,
        nombre: cuenta.firstName,
        apellidos: cuenta.lastName,
        rol: cuenta.role,
        telefono: cuenta.phone,
        biografia: cuenta.bio,
        avatar: cuenta.avatarUrl,
        direccion: cuenta.address,
        ciudad: cuenta.city,
        codigoPostal: cuenta.postalCode,
        ubicacion: cuenta.location,
        correoVerificado: cuenta.isEmailVerified,
        terminosAceptados: cuenta.terminosAceptadosEn,
        versionTerminos: cuenta.versionTerminos,
        creada: cuenta.createdAt,
      },
      servicios: servicios.map((s) => ({
        id: s.id,
        titulo: s.title,
        descripcion: s.description,
        precioMinimo: s.priceMin,
        precioMaximo: s.priceMax,
        unidad: s.priceUnit,
        duracionMinutos: s.durationMinutes,
        direccion: s.address,
        ciudad: s.city,
        radioKm: s.coverageRadiusKm,
        activo: s.isActive,
        retirado: s.withdrawnAt,
        creado: s.createdAt,
      })),
      reservas: {
        comoCliente: comoCliente.map((b) => reserva(b, b.provider)),
        comoProfesional: comoProfesional.map((b) => reserva(b, b.client)),
      },
      pagos: pagos.map((p) => ({
        id: p.id,
        reserva: p.bookingId,
        importe: p.amount,
        moneda: p.currency,
        estado: p.status,
        pagado: p.paidAt,
        reembolsado: p.refundedAt,
        creado: p.createdAt,
      })),
      valoraciones: {
        escritas: escritas.map((r) => ({
          servicio: r.service?.title ?? null,
          nota: r.rating,
          comentario: r.comment,
          respuestaDelProfesional: r.providerResponse,
          fecha: r.createdAt,
        })),
        recibidas: recibidas.map((r) => ({
          servicio: r.service?.title ?? null,
          autor: r.client?.firstName ?? null,
          nota: r.rating,
          comentario: r.comment,
          tuRespuesta: r.providerResponse,
          fecha: r.createdAt,
        })),
      },
      conversaciones: conversaciones.map((c) => {
        const otra =
          c.participantOneId === usuarioId
            ? c.participantTwo
            : c.participantOne;
        return {
          conQuien: otra?.firstName ?? null,
          mensajes: mensajes
            .filter((m) => m.conversationId === c.id)
            .map((m) => ({
              deQuien: m.senderId === usuarioId ? 'yo' : 'la otra parte',
              texto: m.content,
              fecha: m.createdAt,
            })),
        };
      }),
      avisos: avisos.map((a) => ({
        tipo: a.type,
        datos: a.content,
        enlace: a.actionUrl,
        leido: a.isRead,
        fecha: a.createdAt,
      })),
    };
  }

  /**
   * Elimina la cuenta de quien lo pide.
   *
   * Sus datos personales se borran, pero la fila se queda, anonimizada: la
   * necesitan las reservas, los pagos y las valoraciones de otras personas,
   * que no pueden desaparecer porque alguien se vaya, y los pagos hay que
   * conservarlos por obligación fiscal. Sus mensajes siguen en las
   * conversaciones de la otra parte, sin su nombre. La tarjeta guardada en
   * Stripe se borra.
   *
   * Con reservas abiertas no se deja: primero se cancelan o se completan,
   * que es lo que mueve el dinero adonde tiene que ir.
   */
  async eliminarCuenta(usuarioId: string, contrasena: string): Promise<void> {
    const cuenta = await this.userRepository.findOne({
      where: { id: usuarioId },
      select: {
        id: true,
        password: true,
        role: true,
        esDemostracion: true,
        soloLectura: true,
        stripeCustomerId: true,
        eliminadaEn: true,
      },
    });
    if (!cuenta || cuenta.eliminadaEn) {
      throw new NotFoundException('Cuenta no encontrada');
    }
    comprobarQueNoEsDeDemostracion(cuenta);
    // Con una sola cuenta de administración, eliminarla dejaría la
    // plataforma sin nadie que la gobierne.
    if (cuenta.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Una cuenta de administración no se elimina desde aquí.',
      );
    }

    if (!(await bcrypt.compare(contrasena, cuenta.password))) {
      throw new BadRequestException({
        statusCode: 400,
        codigo: CODIGO_CONTRASENA_INCORRECTA,
        message: 'La contraseña no es correcta.',
      });
    }

    const abiertas = await this.dataSource.manager.count(Booking, {
      where: [
        { clientId: usuarioId, status: In(ABIERTAS) },
        { providerId: usuarioId, status: In(ABIERTAS) },
      ],
    });
    if (abiertas > 0) {
      throw new ConflictException({
        statusCode: 409,
        codigo: CODIGO_CUENTA_CON_RESERVAS,
        message:
          'Tienes reservas pendientes o confirmadas: cancélalas o complétalas antes de eliminar la cuenta.',
      });
    }

    // Una contraseña que no conoce nadie, por si la fila llegara a
    // reactivarse por error.
    const inservible = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      await bcrypt.genSalt(10),
    );

    // .invalid es un dominio reservado: nunca llega a ningún buzón. Con el
    // identificador, no choca con otras cuentas eliminadas, y el correo de
    // antes queda libre para registrarse de nuevo.
    const correoAnonimo = `eliminada-${usuarioId}@servilocal.invalid`;

    await this.dataSource.transaction(async (gestor) => {
      // Sus servicios con historial se retiran y se vacían: el título se
      // queda, porque es lo que ven en sus reservas quienes los
      // contrataron. Los que no tienen historial se borran.
      await gestor.query(
        `UPDATE "services"
         SET "isActive" = false,
             "withdrawnAt" = COALESCE("withdrawnAt", now()),
             "description" = 'Servicio retirado.',
             "address" = '—',
             "images" = NULL,
             "location" = ST_SetSRID(ST_MakePoint(0, 0), 4326)
         WHERE "providerId" = $1
           AND EXISTS (SELECT 1 FROM "bookings" b WHERE b."serviceId" = "services"."id")`,
        [usuarioId],
      );
      await gestor.query(
        `DELETE FROM "services"
         WHERE "providerId" = $1
           AND NOT EXISTS (SELECT 1 FROM "bookings" b WHERE b."serviceId" = "services"."id")`,
        [usuarioId],
      );

      await gestor.delete(Notification, { userId: usuarioId });
      await gestor.delete(RestablecimientoContrasena, { userId: usuarioId });

      // El historial de moderación copia el correo de la cuenta que se
      // desactivó o se reactivó: se cambia por el anonimizado. La entrada se
      // queda, porque cuenta una decisión que tomó la administración.
      await gestor.query(
        `UPDATE "audit_logs"
         SET "contexto" = "contexto" || jsonb_build_object('email', $2::text)
         WHERE "entidad" = 'usuario' AND "entidadId" = $1
           AND "contexto" ? 'email'`,
        [usuarioId, correoAnonimo],
      );

      await gestor.update(User, usuarioId, {
        firstName: 'Cuenta',
        lastName: 'eliminada',
        email: correoAnonimo,
        password: inservible,
        phone: null as unknown as string,
        bio: null as unknown as string,
        avatarUrl: null as unknown as string,
        address: null as unknown as string,
        city: null as unknown as string,
        postalCode: null as unknown as string,
        location: null,
        isActive: false,
        isEmailVerified: false,
        stripeCustomerId: null,
        sesionesDesde: segundoActual(),
        eliminadaEn: new Date(),
      });
    });

    if (cuenta.stripeCustomerId) {
      await this.pagos.olvidarCliente(cuenta.stripeCustomerId);
    }
    this.logger.log(`Cuenta ${usuarioId} eliminada por su titular.`);
  }
}
