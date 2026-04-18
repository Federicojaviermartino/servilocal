import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review, Booking, BookingStatus, Service } from '../entities';
import { CreateReviewDto, ProviderResponseDto, ReportReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
  ) {}

  async create(clientId: string, createDto: CreateReviewDto): Promise<Review> {
    const booking = await this.bookingRepository.findOne({
      where: { id: createDto.bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (booking.clientId !== clientId) {
      throw new ForbiddenException('Solo el cliente de la reserva puede valorar');
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Solo se puede valorar una reserva completada');
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

    if (booking.providerId !== providerId) {
      throw new ForbiddenException('Solo el proveedor del servicio puede responder');
    }

    review.providerResponse = dto.providerResponse;
    return this.reviewRepository.save(review);
  }

  async reportReview(
    reviewId: string,
    dto: ReportReviewDto,
  ): Promise<Review> {
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

  async findReported(): Promise<Review[]> {
    return this.reviewRepository.find({
      where: { isReported: true },
      relations: ['client', 'service'],
      order: { createdAt: 'DESC' },
    });
  }

  async deleteReview(reviewId: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Valoración no encontrada');
    }

    const serviceId = review.serviceId;
    await this.reviewRepository.remove(review);
    await this.updateServiceRating(serviceId);
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
