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
} from '../entities';
import {
  CreateReviewDto,
  ProviderResponseDto,
  ReportReviewDto,
} from './dto/review.dto';

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
      relations: ['booking'],
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

  async reportReview(reviewId: string, dto: ReportReviewDto): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Valoración no encontrada');
    }

    review.isReported = true;
    review.reportReason = dto.reportReason;
    return this.reviewRepository.save(review);
  }

  async findByService(serviceId: string): Promise<Review[]> {
    return this.reviewRepository.find({
      where: { serviceId },
      relations: ['client'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByClient(clientId: string): Promise<Review[]> {
    return this.reviewRepository.find({
      where: { clientId },
      relations: ['service'],
      order: { createdAt: 'DESC' },
    });
  }

  async findReported(): Promise<Review[]> {
    return this.reviewRepository.find({
      where: { isReported: true },
      relations: ['client', 'service'],
      order: { createdAt: 'DESC' },
    });
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
