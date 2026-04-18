import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Review, Booking, BookingStatus, Service } from '../entities';

const mockReviewRepository = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockBookingRepository = {
  findOne: jest.fn(),
};

const mockServiceRepository = {
  update: jest.fn(),
};

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: mockReviewRepository },
        { provide: getRepositoryToken(Booking), useValue: mockBookingRepository },
        { provide: getRepositoryToken(Service), useValue: mockServiceRepository },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      bookingId: 'booking-uuid',
      rating: 5,
      comment: 'Excelente servicio',
    };

    it('debería rechazar valoración si la reserva no está completada', async () => {
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'booking-uuid',
        clientId: 'client-uuid',
        status: BookingStatus.PENDING,
        serviceId: 'service-uuid',
      });

      await expect(
        service.create('client-uuid', createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería rechazar valoración si el usuario no es el cliente de la reserva', async () => {
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'booking-uuid',
        clientId: 'other-client',
        status: BookingStatus.COMPLETED,
        serviceId: 'service-uuid',
      });

      await expect(
        service.create('client-uuid', createDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debería rechazar valoración duplicada', async () => {
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'booking-uuid',
        clientId: 'client-uuid',
        status: BookingStatus.COMPLETED,
        serviceId: 'service-uuid',
      });

      mockReviewRepository.findOne.mockResolvedValue({ id: 'existing-review' });

      await expect(
        service.create('client-uuid', createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería crear valoración y actualizar rating del servicio', async () => {
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'booking-uuid',
        clientId: 'client-uuid',
        status: BookingStatus.COMPLETED,
        serviceId: 'service-uuid',
      });

      mockReviewRepository.findOne.mockResolvedValue(null);

      mockReviewRepository.create.mockReturnValue({
        id: 'review-uuid',
        ...createDto,
        clientId: 'client-uuid',
        serviceId: 'service-uuid',
      });

      mockReviewRepository.save.mockResolvedValue({
        id: 'review-uuid',
        ...createDto,
        clientId: 'client-uuid',
        serviceId: 'service-uuid',
      });

      const qbMock = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ avg: '5.00', count: '1' }),
      };
      mockReviewRepository.createQueryBuilder.mockReturnValue(qbMock);

      const result = await service.create('client-uuid', createDto);

      expect(result.rating).toBe(5);
      expect(mockServiceRepository.update).toHaveBeenCalledWith(
        'service-uuid',
        { averageRating: 5, totalReviews: 1 },
      );
    });
  });
});
