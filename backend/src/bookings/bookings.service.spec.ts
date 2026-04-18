import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus, Service } from '../entities';

const mockBookingRepository = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
};

const mockServiceRepository = {
  findOne: jest.fn(),
};

describe('BookingsService', () => {
  let service: BookingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getRepositoryToken(Booking), useValue: mockBookingRepository },
        { provide: getRepositoryToken(Service), useValue: mockServiceRepository },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      serviceId: 'service-uuid',
      scheduledDate: '2026-04-15T10:00:00Z',
      description: 'Reparar grifo',
      totalPrice: 45,
    };

    it('debería crear una reserva correctamente', async () => {
      mockServiceRepository.findOne.mockResolvedValue({
        id: 'service-uuid',
        providerId: 'provider-uuid',
        isActive: true,
      });

      mockBookingRepository.create.mockReturnValue({
        id: 'booking-uuid',
        clientId: 'client-uuid',
        ...createDto,
        status: BookingStatus.PENDING,
      });

      mockBookingRepository.save.mockResolvedValue({
        id: 'booking-uuid',
        clientId: 'client-uuid',
        ...createDto,
        status: BookingStatus.PENDING,
      });

      const result = await service.create('client-uuid', createDto);

      expect(result.status).toBe(BookingStatus.PENDING);
      expect(mockServiceRepository.findOne).toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el servicio no existe', async () => {
      mockServiceRepository.findOne.mockResolvedValue(null);

      await expect(service.create('client-uuid', createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería lanzar BadRequestException si el proveedor intenta reservar su propio servicio', async () => {
      mockServiceRepository.findOne.mockResolvedValue({
        id: 'service-uuid',
        providerId: 'same-user',
        isActive: true,
      });

      await expect(service.create('same-user', createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateStatus', () => {
    it('debería confirmar una reserva pendiente por el proveedor', async () => {
      const booking = {
        id: 'booking-uuid',
        clientId: 'client-uuid',
        providerId: 'provider-uuid',
        status: BookingStatus.PENDING,
        service: {},
        client: {},
        provider: {},
      };

      mockBookingRepository.findOne.mockResolvedValue(booking);
      mockBookingRepository.save.mockResolvedValue({
        ...booking,
        status: BookingStatus.CONFIRMED,
        confirmedAt: expect.any(Date),
      });

      const result = await service.updateStatus(
        'booking-uuid',
        'provider-uuid',
        'provider',
        { status: 'confirmed' },
      );

      expect(mockBookingRepository.save).toHaveBeenCalled();
    });

    it('debería rechazar transición inválida de completada a pendiente', async () => {
      const booking = {
        id: 'booking-uuid',
        clientId: 'client-uuid',
        providerId: 'provider-uuid',
        status: BookingStatus.COMPLETED,
        service: {},
        client: {},
        provider: {},
      };

      mockBookingRepository.findOne.mockResolvedValue(booking);

      await expect(
        service.updateStatus('booking-uuid', 'provider-uuid', 'provider', {
          status: 'pending',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería rechazar confirmación por un usuario que no es el proveedor', async () => {
      const booking = {
        id: 'booking-uuid',
        clientId: 'client-uuid',
        providerId: 'provider-uuid',
        status: BookingStatus.PENDING,
        service: {},
        client: {},
        provider: {},
      };

      mockBookingRepository.findOne.mockResolvedValue(booking);

      await expect(
        service.updateStatus('booking-uuid', 'random-user', 'client', {
          status: 'confirmed',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
