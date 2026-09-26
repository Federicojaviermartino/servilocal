import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { BookingsService } from './bookings.service';
import {
  Booking,
  BookingStatus,
  NotificationType,
  Service,
  User,
} from '../entities';

/** Fechas relativas a hoy: una fija se queda en el pasado con el tiempo. */
const AYER = new Date(Date.now() - 86_400_000);
const MANANA = new Date(Date.now() + 86_400_000);

/** Lo que contesta la consulta de si el hueco ya está comprometido. */
const consultaHorario = {
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  getExists: vi.fn(async () => false),
};

const mockBookingRepository = {
  create: vi.fn(),
  save: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  createQueryBuilder: vi.fn(() => consultaHorario),
};

const mockServiceRepository = {
  findOne: vi.fn(),
};

/** Las cuentas que el doble de usuarios da como de demostración. */
const DEMOSTRACION = new Set<string>();

/**
 * Responde a la consulta de las dos partes, `where: { id: In([...]) }`, con
 * cuentas activas y reales salvo las marcadas como de demostración.
 */
const mockUserRepository = {
  find: vi.fn(async (opciones: { where: { id: { value: string[] } } }) =>
    opciones.where.id.value.map((id) => ({
      id,
      isActive: true,
      esDemostracion: DEMOSTRACION.has(id),
    })),
  ),
};

const avisos = { crear: vi.fn(async () => null) };

const pagos = {
  cobrarAlCompletar: vi.fn(async () => null),
  liberarRetencion: vi.fn(async () => null),
};

/**
 * El gestor de la transacción lee y guarda con el repositorio de siempre,
 * de modo que las comprobaciones siguen mirando los mismos dobles.
 */
const gestor = {
  findOne: vi.fn(async (_entidad: unknown, opciones: unknown) =>
    mockBookingRepository.findOne(opciones),
  ),
  save: vi.fn(async (reserva: unknown) => mockBookingRepository.save(reserva)),
  getRepository: vi.fn(() => mockBookingRepository),
};

const dataSource = {
  transaction: vi.fn(async (ejecutar: (g: typeof gestor) => Promise<unknown>) =>
    ejecutar(gestor),
  ),
};

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
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        { provide: NotificationsService, useValue: avisos },
        { provide: PaymentsService, useValue: pagos },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    vi.clearAllMocks();
    DEMOSTRACION.clear();
    consultaHorario.getExists.mockResolvedValue(false);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      serviceId: 'service-uuid',
      scheduledDate: MANANA.toISOString(),
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

    describe('fechas y agenda', () => {
      beforeEach(() => {
        mockServiceRepository.findOne.mockResolvedValue({
          id: 'service-uuid',
          providerId: 'provider-uuid',
          isActive: true,
          priceMin: 45,
          durationMinutes: 90,
        });
        mockBookingRepository.create.mockImplementation((b: unknown) => b);
        mockBookingRepository.save.mockImplementation(async (b: unknown) => ({
          id: 'booking-uuid',
          ...(b as object),
        }));
      });

      const codigo = async (promesa: Promise<unknown>) =>
        (
          (await promesa.catch((e: unknown) => e)) as BadRequestException
        ).getResponse();

      it('la reserva se lleva la duración del servicio', async () => {
        // Copiada: si el profesional la cambia después, las reservas que ya
        // tiene siguen ocupando lo que ocupaban.
        const reserva = await service.create('client-uuid', createDto);

        expect(reserva.durationMinutes).toBe(90);
      });

      it('no se reserva para una fecha pasada', async () => {
        const respuesta = await codigo(
          service.create('client-uuid', {
            ...createDto,
            scheduledDate: AYER.toISOString(),
          }),
        );

        expect(respuesta).toMatchObject({ codigo: 'fecha-pasada' });
        expect(mockBookingRepository.save).not.toHaveBeenCalled();
      });

      it('ni con más de un año de antelación', async () => {
        const dentroDeDosAnos = new Date(Date.now() + 2 * 365 * 86_400_000);

        const respuesta = await codigo(
          service.create('client-uuid', {
            ...createDto,
            scheduledDate: dentroDeDosAnos.toISOString(),
          }),
        );

        expect(respuesta).toMatchObject({ codigo: 'fecha-lejana' });
      });

      it('un hueco que el profesional ya tiene comprometido se dice al pedirlo', async () => {
        consultaHorario.getExists.mockResolvedValue(true);

        const error = await service
          .create('client-uuid', createDto)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          codigo: 'solape',
        });
        expect(mockBookingRepository.save).not.toHaveBeenCalled();
      });

      it('y la consulta mira solo sus reservas confirmadas', async () => {
        await service.create('client-uuid', createDto);

        expect(consultaHorario.where).toHaveBeenCalledWith(
          'reserva.providerId = :providerId',
          { providerId: 'provider-uuid' },
        );
        expect(consultaHorario.andWhere).toHaveBeenCalledWith(
          'reserva.status = :confirmada',
          { confirmada: BookingStatus.CONFIRMED },
        );
        // El intervalo pedido: desde la fecha, lo que dura el servicio.
        const [, { inicio, fin }] = consultaHorario.andWhere.mock.calls.find(
          ([condicion]) => String(condicion).includes('tsrange'),
        ) as unknown as [string, { inicio: Date; fin: Date }];
        expect(fin.getTime() - inicio.getTime()).toBe(90 * 60_000);
      });
    });

    it('avisa al profesional de la solicitud nueva', async () => {
      // Se enteraba recargando su bandeja: el aviso existía en el catálogo
      // y nadie lo enviaba.
      mockServiceRepository.findOne.mockResolvedValue({
        id: 'service-uuid',
        providerId: 'provider-uuid',
        isActive: true,
      });
      mockBookingRepository.create.mockReturnValue({ id: 'booking-uuid' });
      mockBookingRepository.save.mockResolvedValue({ id: 'booking-uuid' });

      await service.create('client-uuid', createDto);

      expect(avisos.crear).toHaveBeenCalledWith({
        usuarioId: 'provider-uuid',
        tipo: NotificationType.BOOKING_REQUEST,
        enlace: '/dashboard/bookings/booking-uuid',
      });
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

    describe('cuentas de demostración', () => {
      // Las cuentas de la semilla se publican con su contraseña. Una cuenta
      // real que reservara con ellas quedaba a la vista de cualquiera que
      // entrase como ese profesional: ver common/demostracion.ts.
      beforeEach(() => {
        mockServiceRepository.findOne.mockResolvedValue({
          id: 'service-uuid',
          providerId: 'provider-uuid',
          isActive: true,
          priceMin: 10,
          priceMax: null,
        });
        mockBookingRepository.create.mockImplementation((r: unknown) => r);
        mockBookingRepository.save.mockImplementation(async (r: unknown) => r);
      });

      it('una cuenta real no reserva el servicio de una de demostración', async () => {
        DEMOSTRACION.add('provider-uuid');

        await expect(
          service.create('client-uuid', createDto),
        ).rejects.toMatchObject({
          status: 403,
          response: expect.objectContaining({ codigo: 'demostracion' }),
        });
        expect(mockBookingRepository.save).not.toHaveBeenCalled();
      });

      it('ni una de demostración el de una real', async () => {
        DEMOSTRACION.add('client-uuid');

        await expect(service.create('client-uuid', createDto)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('entre cuentas de demostración se reserva como siempre', async () => {
        DEMOSTRACION.add('client-uuid');
        DEMOSTRACION.add('provider-uuid');

        const reserva = await service.create('client-uuid', createDto);

        expect(reserva.status).toBe(BookingStatus.PENDING);
      });
    });
  });

  describe('updateStatus', () => {
    it('debería confirmar una reserva pendiente por el proveedor', async () => {
      const booking = {
        id: 'booking-uuid',
        clientId: 'client-uuid',
        providerId: 'provider-uuid',
        status: BookingStatus.PENDING,
        scheduledDate: MANANA,
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
        { status: BookingStatus.CONFIRMED },
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
          status: BookingStatus.PENDING,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería rechazar confirmación por un usuario que no es el proveedor', async () => {
      const booking = {
        id: 'booking-uuid',
        clientId: 'client-uuid',
        providerId: 'provider-uuid',
        status: BookingStatus.PENDING,
        scheduledDate: MANANA,
        service: {},
        client: {},
        provider: {},
      };

      mockBookingRepository.findOne.mockResolvedValue(booking);

      await expect(
        service.updateStatus('booking-uuid', 'random-user', 'client', {
          status: BookingStatus.CONFIRMED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
  describe('la máquina de estados de una reserva', () => {
    const reserva = (status: BookingStatus, scheduledDate = MANANA) => ({
      id: 'b1',
      clientId: 'c1',
      providerId: 'p1',
      status,
      scheduledDate,
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
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(desde, hasta === 'completed' ? AYER : MANANA),
      );
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

    it('no se completa antes de su fecha: sería cobrar un trabajo por hacer', async () => {
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.CONFIRMED, MANANA),
      );

      const error = await service
        .updateStatus('b1', 'p1', 'provider', {
          status: BookingStatus.COMPLETED,
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: 'antes-de-la-fecha',
      });
      expect(pagos.cobrarAlCompletar).not.toHaveBeenCalled();
      expect(mockBookingRepository.save).not.toHaveBeenCalled();
    });

    it('ni se acepta una cuya hora ya pasó', async () => {
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.PENDING, AYER),
      );

      const error = await service
        .updateStatus('b1', 'p1', 'provider', {
          status: BookingStatus.CONFIRMED,
        })
        .catch((e: unknown) => e);

      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: 'fecha-pasada',
      });
    });

    it('pero sí se rechaza o se cancela, pasada o no', async () => {
      // Cerrar lo que ya no va a ocurrir tiene que poder hacerse siempre.
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.PENDING, AYER),
      );
      mockBookingRepository.save.mockImplementation(async (b: unknown) => b);

      const r = await service.updateStatus('b1', 'p1', 'provider', {
        status: BookingStatus.REJECTED,
      });

      expect(r.status).toBe(BookingStatus.REJECTED);
    });

    it('las fechas no se le cuentan a quien no puede tocar la reserva', async () => {
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.CONFIRMED, MANANA),
      );

      await expect(
        service.updateStatus('b1', 'ajeno', 'client', {
          status: BookingStatus.COMPLETED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('dos confirmadas que se pisan: la base lo impide y sale como 409', async () => {
      // La restricción de exclusión es la que manda: dos confirmaciones a
      // la vez no se ven entre sí, pero la base sí las ve.
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.PENDING, MANANA),
      );
      mockBookingRepository.save.mockRejectedValueOnce(
        new QueryFailedError('UPDATE "bookings" ...', [], {
          code: '23P01',
        } as unknown as Error),
      );

      const error = await service
        .updateStatus('b1', 'p1', 'provider', {
          status: BookingStatus.CONFIRMED,
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        codigo: 'solape',
      });
      expect(avisos.crear).not.toHaveBeenCalled();
    });

    it('aceptar una que pisa otra confirmada se rechaza sin llegar a guardar', async () => {
      // La API lo comprueba también, por si la base no tiene la restricción
      // (ver CalendarioReservas): lo que solo ve la base es el caso de dos
      // confirmaciones en el mismo instante.
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.PENDING, MANANA),
      );
      consultaHorario.getExists.mockResolvedValue(true);

      const error = await service
        .updateStatus('b1', 'p1', 'provider', {
          status: BookingStatus.CONFIRMED,
        })
        .catch((e: unknown) => e);

      expect((error as ConflictException).getResponse()).toMatchObject({
        codigo: 'solape',
      });
      expect(gestor.getRepository).toHaveBeenCalledWith(Booking);
      expect(mockBookingRepository.save).not.toHaveBeenCalled();
    });

    it('rechazar o cancelar no mira la agenda', async () => {
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.PENDING, MANANA),
      );
      mockBookingRepository.save.mockImplementation(async (b: unknown) => b);
      consultaHorario.getExists.mockResolvedValue(true);

      const r = await service.updateStatus('b1', 'p1', 'provider', {
        status: BookingStatus.REJECTED,
      });

      expect(r.status).toBe(BookingStatus.REJECTED);
    });

    it('otro error al guardar no se disfraza de solape', async () => {
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.PENDING, MANANA),
      );
      mockBookingRepository.save.mockRejectedValueOnce(new Error('sin base'));

      await expect(
        service.updateStatus('b1', 'p1', 'provider', {
          status: BookingStatus.CONFIRMED,
        }),
      ).rejects.toThrow('sin base');
    });

    it('todo ocurre en una transacción, con la reserva bloqueada', async () => {
      // Si el profesional completaba mientras el cliente cancelaba, las dos
      // validaban contra el mismo estado: una cobraba y la otra dejaba la
      // reserva cancelada con el dinero cobrado. Con el bloqueo, la segunda
      // espera y valida contra lo que dejó la primera.
      await cambiar(BookingStatus.CONFIRMED, 'completed');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(gestor.findOne).toHaveBeenCalledWith(Booking, {
        where: { id: 'b1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(gestor.save).toHaveBeenCalled();
    });
  });

  describe('a quién se avisa de cada cambio', () => {
    const reserva = (status: BookingStatus, scheduledDate = MANANA) => ({
      id: 'b1',
      clientId: 'c1',
      providerId: 'p1',
      status,
      scheduledDate,
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
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(desde, hasta === 'completed' ? AYER : MANANA),
      );
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

      expect(avisos.crear).toHaveBeenCalledTimes(1);
      expect(avisos.crear).toHaveBeenCalledWith(
        expect.objectContaining({ usuarioId: 'p1' }),
      );
    });

    it('y la del profesional, al cliente', async () => {
      // El aviso iba siempre al profesional: si cancelaba él, se avisaba a
      // sí mismo y el cliente se presentaba sin saberlo.
      await cambiar(BookingStatus.CONFIRMED, 'cancelled', 'p1', 'provider');

      expect(avisos.crear).toHaveBeenCalledTimes(1);
      expect(avisos.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          usuarioId: 'c1',
          tipo: NotificationType.BOOKING_CANCELLED,
        }),
      );
    });

    it('si cancela la moderación, se enteran las dos partes', async () => {
      await cambiar(BookingStatus.CONFIRMED, 'cancelled', 'admin', 'admin');

      expect(avisos.crear).toHaveBeenCalledTimes(2);
      expect(avisos.crear).toHaveBeenCalledWith(
        expect.objectContaining({ usuarioId: 'c1' }),
      );
      expect(avisos.crear).toHaveBeenCalledWith(
        expect.objectContaining({ usuarioId: 'p1' }),
      );
    });

    it('completar sin cobro se lo dice al cliente', async () => {
      // Para que sepa que tiene un pago pendiente.
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.CONFIRMED, AYER),
      );
      mockBookingRepository.save.mockImplementation(async (b: unknown) => b);

      await service.updateStatus('b1', 'p1', 'provider', {
        status: BookingStatus.COMPLETED,
        sinCobro: true,
      });

      expect(avisos.crear).toHaveBeenCalledWith({
        usuarioId: 'c1',
        tipo: NotificationType.BOOKING_COMPLETED,
        datos: { estado: BookingStatus.COMPLETED, sinCobro: 'si' },
        enlace: '/dashboard/bookings/b1',
      });
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
          relations: { service: { category: true }, provider: true },
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
          relations: { service: { category: true }, client: true },
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
        scheduledDate: MANANA.toISOString(),
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
  describe('el dinero sigue a la reserva', () => {
    const reserva = (status: BookingStatus, scheduledDate = MANANA) => ({
      id: 'b1',
      clientId: 'c1',
      providerId: 'p1',
      status,
      scheduledDate,
      service: {},
      client: {},
      provider: {},
    });

    const cambiar = (
      desde: BookingStatus,
      hasta: string,
      quien = 'p1',
      rol = 'provider',
    ) => {
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(desde, hasta === 'completed' ? AYER : MANANA),
      );
      mockBookingRepository.save.mockImplementation(async (b: unknown) => b);
      return service.updateStatus('b1', quien, rol, { status: hasta } as never);
    };

    it('completar el trabajo cobra la retención', async () => {
      // Esto es lo que no ocurría: el dinero se autorizaba al reservar y se
      // quedaba ahí hasta que Stripe soltaba la autorización a los siete
      // días. La plataforma no llegaba a cobrar nunca.
      await cambiar(BookingStatus.CONFIRMED, 'completed');

      // Con el gestor de la transacción: el dinero y el estado se deciden
      // juntos, con la reserva bloqueada.
      expect(pagos.cobrarAlCompletar).toHaveBeenCalledWith('b1', {
        gestor,
        sinCobro: false,
      });
    });

    it('«sin cobro» llega al servicio de pagos, que es quien decide', async () => {
      mockBookingRepository.findOne.mockResolvedValue(
        reserva(BookingStatus.CONFIRMED, AYER),
      );
      mockBookingRepository.save.mockImplementation(async (b: unknown) => b);

      await service.updateStatus('b1', 'p1', 'provider', {
        status: BookingStatus.COMPLETED,
        sinCobro: true,
      });

      expect(pagos.cobrarAlCompletar).toHaveBeenCalledWith('b1', {
        gestor,
        sinCobro: true,
      });
    });

    it('si el cobro falla, la reserva no se da por completada', async () => {
      // Un trabajo cerrado y sin cobrar no lo vuelve a mirar nadie. Que el
      // profesional vea el error y repita.
      pagos.cobrarAlCompletar.mockRejectedValueOnce(
        new Error('tarjeta caducada'),
      );

      await expect(
        cambiar(BookingStatus.CONFIRMED, 'completed'),
      ).rejects.toThrow('tarjeta caducada');
      expect(mockBookingRepository.save).not.toHaveBeenCalled();
    });

    it('cancelar suelta la retención', async () => {
      await cambiar(BookingStatus.CONFIRMED, 'cancelled', 'c1', 'client');

      expect(pagos.liberarRetencion).toHaveBeenCalledWith('b1', gestor);
      expect(pagos.cobrarAlCompletar).not.toHaveBeenCalled();
    });

    it('rechazar también', async () => {
      await cambiar(BookingStatus.PENDING, 'rejected');

      expect(pagos.liberarRetencion).toHaveBeenCalledWith('b1', gestor);
    });

    it('aceptar no mueve dinero', async () => {
      // Aceptar es un compromiso, no un cobro: el dinero sigue retenido
      // hasta que el trabajo esté hecho.
      await cambiar(BookingStatus.PENDING, 'confirmed');

      expect(pagos.cobrarAlCompletar).not.toHaveBeenCalled();
      expect(pagos.liberarRetencion).not.toHaveBeenCalled();
    });

    it('un cambio rechazado no toca el dinero', async () => {
      await expect(
        cambiar(BookingStatus.COMPLETED, 'cancelled'),
      ).rejects.toThrow(BadRequestException);

      expect(pagos.liberarRetencion).not.toHaveBeenCalled();
      expect(pagos.cobrarAlCompletar).not.toHaveBeenCalled();
    });

    it('un intento sin permiso tampoco', async () => {
      // Se comprueba antes de mover nada: si el orden se invirtiera, un
      // tercero soltaría la retención de una reserva ajena y la excepción
      // llegaría tarde.
      await expect(
        cambiar(BookingStatus.PENDING, 'cancelled', 'ajeno', 'client'),
      ).rejects.toThrow(ForbiddenException);

      expect(pagos.liberarRetencion).not.toHaveBeenCalled();
    });
  });
});
