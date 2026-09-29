import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditoriaService, type Actor } from '../auditoria/auditoria.service';
import {
  AccionAuditada,
  Review,
  Booking,
  BookingStatus,
  Service,
  NotificationType,
  User,
} from '../entities';
import {
  CreateReviewDto,
  ProviderResponseDto,
  ReportReviewDto,
} from './dto/review.dto';
import { TOPE_LISTA, TOPE_LISTA_PUBLICA } from '../common/topes';
import { servicioPublico } from '../services/servicio-publico';

/** De quien valoró, lo que se enseña a cualquiera: nombre e inicial. */
function autorPublico(cliente: User): User {
  const inicial = cliente.lastName?.trim().charAt(0).toUpperCase();
  return {
    firstName: cliente.firstName,
    lastName: inicial ? `${inicial}.` : '',
    avatarUrl: cliente.avatarUrl,
  } as User;
}

/** Sin la dirección de referencia del servicio: ver servicioPublico. */
function conServicioPublico(valoracion: Review): Review {
  return valoracion.service
    ? ({
        ...valoracion,
        service: servicioPublico(valoracion.service),
      } as Review)
    : valoracion;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    private readonly avisos: NotificationsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async create(clientId: string, createDto: CreateReviewDto): Promise<Review> {
    const booking = await this.bookingRepository.findOne({
      where: { id: createDto.bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (booking.clientId !== clientId) {
      throw new ForbiddenException(
        'Solo el cliente de la reserva puede valorar',
      );
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException(
        'Solo se puede valorar una reserva completada',
      );
    }

    const existingReview = await this.reviewRepository.findOne({
      where: { bookingId: createDto.bookingId },
    });

    if (existingReview) {
      throw new BadRequestException('Esta reserva ya tiene una valoración');
    }

    const review = this.reviewRepository.create({
      bookingId: createDto.bookingId,
      clientId,
      serviceId: booking.serviceId,
      rating: createDto.rating,
      comment: createDto.comment,
    });

    const savedReview = await this.reviewRepository.save(review);

    await this.updateServiceRating(booking.serviceId);

    // El profesional se enteraba de una valoración nueva solo si entraba a
    // mirarla, y es justo lo que quiere saber el mismo día.
    await this.avisos.crear({
      usuarioId: booking.providerId,
      tipo: NotificationType.NEW_REVIEW,
      datos: { nota: String(createDto.rating) },
      enlace: '/dashboard/reviews',
    });

    return savedReview;
  }

  async addProviderResponse(
    reviewId: string,
    providerId: string,
    dto: ProviderResponseDto,
  ): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: {
        booking: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Valoración no encontrada');
    }

    const booking = await this.bookingRepository.findOne({
      where: { id: review.bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Reserva asociada no encontrada');
    }

    if (booking.providerId !== providerId) {
      throw new ForbiddenException(
        'Solo el proveedor del servicio puede responder',
      );
    }

    review.providerResponse = dto.providerResponse;
    return this.reviewRepository.save(review);
  }

  async reportReview(
    reviewId: string,
    dto: ReportReviewDto,
    denunciante?: { esDemostracion?: boolean },
  ): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: { client: true },
    });

    // Cada mundo denuncia lo suyo, como reserva y escribe a los suyos. Una
    // cuenta de demostración, cuya contraseña es pública, llenaría la cola de
    // la moderación de verdad; y el motivo que escribe una cuenta real, texto
    // libre, acabaría en la cola que ve la administración de demostración.
    // Lo de la demostración, además, se restaura solo cada hora.
    if (
      !review ||
      (denunciante &&
        Boolean(denunciante.esDemostracion) !==
          Boolean(review.client?.esDemostracion))
    ) {
      throw new NotFoundException('Valoración no encontrada');
    }

    review.isReported = true;
    review.reportReason = dto.reportReason;
    return this.reviewRepository.save(review);
  }

  /**
   * Las valoraciones de un servicio, que lee cualquiera sin identificarse.
   *
   * La relación traía la fila entera de quien valoró: su correo, su teléfono,
   * su dirección, su código postal y sus coordenadas. Lo mismo que ya se
   * corrigió para el proveedor en la búsqueda, y que aquí se quedó sin
   * corregir. De la reseña tampoco salen el identificador de la reserva ni el
   * motivo de la denuncia: lo primero permitía cruzar datos y lo segundo es
   * una alegación privada entre el profesional y la moderación.
   *
   * Y de quien valoró, solo el nombre y la inicial del apellido: con el
   * nombre completo, la ciudad y su identificador, quien dejaba una reseña
   * negativa quedaba identificado ante cualquiera, que además podía
   * escribirle.
   */
  async findByService(serviceId: string): Promise<Review[]> {
    const valoraciones = await this.reviewRepository.find({
      where: { serviceId },
      relations: { client: true },
      select: {
        id: true,
        serviceId: true,
        rating: true,
        comment: true,
        providerResponse: true,
        createdAt: true,
        client: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
      order: { createdAt: 'DESC' },
      take: TOPE_LISTA_PUBLICA,
    });
    return valoraciones.map((valoracion) => ({
      ...valoracion,
      client: valoracion.client && autorPublico(valoracion.client),
    }));
  }

  async findByClient(clientId: string): Promise<Review[]> {
    const valoraciones = await this.reviewRepository.find({
      where: { clientId },
      relations: {
        service: true,
      },
      order: { createdAt: 'DESC' },
      take: TOPE_LISTA,
    });
    return valoraciones.map(conServicioPublico);
  }

  /** Con `soloDemostracion`, las de la demostración: ver soloVeLaDemostracion. */
  async findReported({
    soloDemostracion = false,
  }: { soloDemostracion?: boolean } = {}): Promise<Review[]> {
    const denunciadas = await this.reviewRepository.find({
      where: soloDemostracion
        ? { isReported: true, client: { esDemostracion: true } }
        : { isReported: true },
      relations: {
        client: true,
        service: true,
      },
      order: { createdAt: 'DESC' },
      take: TOPE_LISTA,
    });
    return denunciadas.map(conServicioPublico);
  }

  async dismissReport(reviewId: string, actor: Actor): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Valoración no encontrada');
    }
    // El motivo alegado se copia al historial antes de borrarlo de la
    // valoración: si no, se pierde justo la razón por la que se moderó.
    const motivo = review.reportReason ?? '';
    review.isReported = false;
    review.reportReason = null;
    const guardada = await this.reviewRepository.save(review);

    await this.auditoria.anotar({
      actor,
      accion: AccionAuditada.REPORTE_DESCARTADO,
      entidad: 'valoracion',
      entidadId: guardada.id,
      contexto: { motivo: motivo.slice(0, 200) },
    });

    return guardada;
  }

  async deleteReview(reviewId: string, actor: Actor): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Valoración no encontrada');
    }

    const serviceId = review.serviceId;
    // Se guarda antes de borrar: después no habría nada de lo que copiarlo,
    // y un historial que solo dice «se eliminó algo» no sirve de nada.
    const contexto = {
      nota: String(review.rating),
      comentario: (review.comment ?? '').slice(0, 200),
    };

    await this.reviewRepository.remove(review);
    await this.updateServiceRating(serviceId);

    await this.auditoria.anotar({
      actor,
      accion: AccionAuditada.VALORACION_ELIMINADA,
      entidad: 'valoracion',
      entidadId: reviewId,
      contexto,
    });
  }

  private async updateServiceRating(serviceId: string): Promise<void> {
    const result = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avg')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.serviceId = :serviceId', { serviceId })
      .getRawOne();

    await this.serviceRepository.update(serviceId, {
      averageRating: parseFloat(result.avg) || 0,
      totalReviews: parseInt(result.count) || 0,
    });
  }
}
