import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
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

const avisos = { crear: jest.fn(async () => null) };

describe('BookingsService', () => {
  let service: BookingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: mockBookingRepository,
        },
        {
          provide: getRepositoryToken(Service),
          useValue: mockServiceRepository,
        },
        { provide: NotificationsService, useValue: avisos },
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
      expect(result.status).toBe(BookingStatus.CONFIRMED);
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
  describe('la máquina de estados de una reserva', () => {
    const reserva = (status: BookingStatus) => ({
      id: 'b1',
      clientId: 'c1',
      providerId: 'p1',
      status,
      service: {},
      client: {},
      provider: {},
    });

    const cambiar = async (
      desde: BookingStatus,
      hasta: string,
      quien = 'p1',
      rol = 'provider',
      extra: Record<string, unknown> = {},
    ) => {
      mockBookingRepository.findOne.mockResolvedValue(reserva(desde));
      mockBookingRepository.save.mockImplementation(async (b: unknown) => b);
      return service.updateStatus('b1', quien, rol, {
        status: hasta,
        ...extra,
      } as never);
    };

    it('completar una reserva confirmada deja la fecha de cierre', async () => {
      const r = await cambiar(BookingStatus.CONFIRMED, 'completed');

      expect(r.status).toBe(BookingStatus.COMPLETED);
      expect(r.completedAt).toBeInstanceOf(Date);
    });

    it('rechazar una pendiente guarda el motivo alegado', async () => {
      const r = await cambiar(
        BookingStatus.PENDING,
        'rejected',
        'p1',
        'provider',
        {
          cancellationReason: 'Esa semana no tengo hueco',
        },
      );

      expect(r.cancelledAt).toBeInstanceOf(Date);
      expect(r.cancellationReason).toBe('Esa semana no tengo hueco');
    });

    it('cancelar sin motivo deja el campo a nulo, no a cadena vacía', async () => {
      // Una cadena vacía en la pantalla se lee como «motivo: » sin nada
      // detrás; el nulo permite no pintar la línea siquiera.
      const r = await cambiar(
        BookingStatus.PENDING,
        'cancelled',
        'c1',
        'client',
      );

      expect(r.cancellationReason).toBeNull();
    });

    it('el cliente cancela su propia reserva', async () => {
      const r = await cambiar(
        BookingStatus.PENDING,
        'cancelled',
        'c1',
        'client',
      );

      expect(r.status).toBe(BookingStatus.CANCELLED);
    });

    it('el profesional también puede cancelarla', async () => {
      const r = await cambiar(BookingStatus.CONFIRMED, 'cancelled', 'p1');

      expect(r.status).toBe(BookingStatus.CANCELLED);
    });

    it('un tercero no cancela la reserva de nadie', async () => {
      await expect(
        cambiar(BookingStatus.PENDING, 'cancelled', 'ajeno', 'client'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('administración sí puede, porque para eso modera', async () => {
      const r = await cambiar(
        BookingStatus.PENDING,
        'confirmed',
        'ajeno',
        'admin',
      );

      expect(r.status).toBe(BookingStatus.CONFIRMED);
    });

    it.each([
      [BookingStatus.PENDING, 'completed'],
      [BookingStatus.CANCELLED, 'confirmed'],
      [BookingStatus.REJECTED, 'confirmed'],
      [BookingStatus.COMPLETED, 'cancelled'],
    ])('de %s no se pasa a %s', async (desde, hasta) => {
      // Saltarse la confirmación permitiría dar por hecho un trabajo que
      // nadie aceptó, y con él la valoración y el cobro.
      await expect(cambiar(desde, hasta)).rejects.toThrow(BadRequestException);
    });

    it('avisa si la reserva no existe', async () => {
      mockBookingRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus('b1', 'p1', 'provider', {
          status: 'confirmed',
        } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('a quién se avisa de cada cambio', () => {
    const reserva = (status: BookingStatus) => ({
      id: 'b1',
      clientId: 'c1',
      providerId: 'p1',
      status,
      service: {},
      client: {},
      provider: {},
    });

    const cambiar = async (
      desde: BookingStatus,
      hasta: string,
      quien: string,
      rol: string,
    ) => {
      mockBookingRepository.findOne.mockResolvedValue(reserva(desde));
      mockBookingRepository.save.mockImplementation(async (b: unknown) => b);
      await service.updateStatus('b1', quien, rol, { status: hasta } as never);
    };

    it.each([
      ['confirmed', BookingStatus.PENDING, 'p1', 'provider'],
      ['rejected', BookingStatus.PENDING, 'p1', 'provider'],
      ['completed', BookingStatus.CONFIRMED, 'p1', 'provider'],
    ])('%s se le cuenta al cliente', async (hasta, desde, quien, rol) => {
      // El aviso va a quien no hizo el cambio: contárselo a quien acaba de
      // pulsar el botón no informa de nada.
      await cambiar(desde as BookingStatus, hasta, quien, rol);

      expect(avisos.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          usuarioId: 'c1',
          enlace: '/dashboard/bookings/b1',
        }),
      );
    });

    it('la cancelación del cliente se le cuenta al profesional', async () => {
      await cambiar(BookingStatus.PENDING, 'cancelled', 'c1', 'client');

      expect(avisos.crear).toHaveBeenCalledWith(
        expect.objectContaining({ usuarioId: 'p1' }),
      );
    });

    it('un cambio rechazado no avisa a nadie', async () => {
      await expect(
        cambiar(BookingStatus.COMPLETED, 'cancelled', 'p1', 'provider'),
      ).rejects.toThrow(BadRequestException);

      expect(avisos.crear).not.toHaveBeenCalled();
    });
  });

  describe('listados de reservas', () => {
    it('las del cliente traen el servicio y el profesional', async () => {
      mockBookingRepository.find.mockResolvedValue([]);

      await service.findByClient('c1');

      expect(mockBookingRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'c1' },
          relations: ['service', 'service.category', 'provider'],
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('las del profesional traen al cliente en su lugar', async () => {
      mockBookingRepository.find.mockResolvedValue([]);

      await service.findByProvider('p1');

      expect(mockBookingRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId: 'p1' },
          relations: ['service', 'service.category', 'client'],
        }),
      );
    });
  });
  describe('el importe lo valida el servicio, no el navegador', () => {
    const conTarifa = (priceMin: number, priceMax: number | null) => {
      mockServiceRepository.findOne.mockResolvedValue({
        id: 's1',
        providerId: 'p1',
        priceMin,
        priceMax,
        isActive: true,
      });
      mockBookingRepository.create.mockImplementation((b: unknown) => b);
      mockBookingRepository.save.mockImplementation(async (b: unknown) => b);
    };

    const reservar = (totalPrice: number) =>
      service.create('c1', {
        serviceId: 's1',
        scheduledDate: '2026-12-01T10:00:00Z',
        totalPrice,
      } as never);

    it('un importe dentro de la horquilla se acepta tal cual', async () => {
      conTarifa(40, 90);

      expect((await reservar(60)).totalPrice).toBe(60);
    });

    it('por debajo del mínimo publicado se rechaza', async () => {
      // Aquí estaba el agujero: un servicio de 500 euros se reservaba por
      // cincuenta céntimos, y ese número era el que se cobraba en Stripe.
      conTarifa(500, null);

      await expect(reservar(0.5)).rejects.toThrow(BadRequestException);
      expect(mockBookingRepository.save).not.toHaveBeenCalled();
    });

    it('un cero tampoco pasa', async () => {
      // Con cero, Stripe rechazaba el importe y la API devolvía un 500.
      conTarifa(40, 90);

      await expect(reservar(0)).rejects.toThrow(BadRequestException);
    });

    it('por encima del máximo publicado se rechaza', async () => {
      conTarifa(40, 90);

      await expect(reservar(900)).rejects.toThrow(BadRequestException);
    });

    it('sin máximo publicado, por arriba no hay tope', async () => {
      // Pagar de más es decisión de quien paga.
      conTarifa(40, null);

      expect((await reservar(120)).totalPrice).toBe(120);
    });

    it('justo en los extremos entra', async () => {
      conTarifa(40, 90);

      expect((await reservar(40)).totalPrice).toBe(40);
      expect((await reservar(90)).totalPrice).toBe(90);
    });
  });

  describe('quién puede leer una reserva', () => {
    const RESERVA = {
      id: 'b1',
      clientId: 'c1',
      providerId: 'p1',
      status: BookingStatus.CONFIRMED,
    };

    it('la ve su cliente', async () => {
      mockBookingRepository.findOne.mockResolvedValue(RESERVA);

      expect(
        await service.findById('b1', { id: 'c1', role: 'client' }),
      ).toBeTruthy();
    });

    it('y su profesional', async () => {
      mockBookingRepository.findOne.mockResolvedValue(RESERVA);

      expect(
        await service.findById('b1', { id: 'p1', role: 'provider' }),
      ).toBeTruthy();
    });

    it('un tercero no, aunque sepa el identificador', async () => {
      // Y no hacía falta adivinarlo: la API pública de valoraciones lo
      // devolvía en cada reseña. Dentro van el domicilio, la fecha y el
      // importe de un trabajo ajeno.
      mockBookingRepository.findOne.mockResolvedValue(RESERVA);

      await expect(
        service.findById('b1', { id: 'ajeno', role: 'client' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('la moderación sí', async () => {
      mockBookingRepository.findOne.mockResolvedValue(RESERVA);

      expect(
        await service.findById('b1', { id: 'admin', role: 'admin' }),
      ).toBeTruthy();
    });

    it('sin solicitante sigue valiendo para uso interno', async () => {
      // updateStatus la usa por dentro y ya comprueba permisos por su cuenta.
      mockBookingRepository.findOne.mockResolvedValue(RESERVA);

      expect(await service.findById('b1')).toBeTruthy();
    });
  });
});
