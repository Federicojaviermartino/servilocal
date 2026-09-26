import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Review, Booking, BookingStatus, Service } from '../entities';

const mockReviewRepository = {
  create: vi.fn(),
  save: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  remove: vi.fn(),
  createQueryBuilder: vi.fn(),
};

const mockBookingRepository = {
  findOne: vi.fn(),
};

const mockServiceRepository = {
  update: vi.fn(),
};

const avisos = { crear: vi.fn(async () => null) };
const auditoria = { anotar: vi.fn(async () => undefined) };

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: mockReviewRepository },
        {
          provide: getRepositoryToken(Booking),
          useValue: mockBookingRepository,
        },
        {
          provide: getRepositoryToken(Service),
          useValue: mockServiceRepository,
        },
        { provide: NotificationsService, useValue: avisos },
        { provide: AuditoriaService, useValue: auditoria },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    vi.clearAllMocks();
  });

  /** Constructor de consultas para el recálculo de la media. */
  function medias(avg: string | null, count: string) {
    const qb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue({ avg, count }),
    };
    mockReviewRepository.createQueryBuilder.mockReturnValue(qb);
    return qb;
  }

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

      await expect(service.create('client-uuid', createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debería rechazar valoración si el usuario no es el cliente de la reserva', async () => {
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'booking-uuid',
        clientId: 'other-client',
        status: BookingStatus.COMPLETED,
        serviceId: 'service-uuid',
      });

      await expect(service.create('client-uuid', createDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('debería rechazar valoración duplicada', async () => {
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'booking-uuid',
        clientId: 'client-uuid',
        status: BookingStatus.COMPLETED,
        serviceId: 'service-uuid',
      });

      mockReviewRepository.findOne.mockResolvedValue({ id: 'existing-review' });

      await expect(service.create('client-uuid', createDto)).rejects.toThrow(
        BadRequestException,
      );
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
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawOne: vi.fn().mockResolvedValue({ avg: '5.00', count: '1' }),
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

  describe('valorar', () => {
    const DTO = { bookingId: 'b1', rating: 4, comment: 'Puntual' };

    it('avisa al profesional con la nota recibida', async () => {
      // Se entera el mismo día en lugar de al entrar a mirar, que es cuando
      // una valoración mala todavía se puede contestar a tiempo.
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'b1',
        clientId: 'c1',
        providerId: 'p1',
        status: BookingStatus.COMPLETED,
        serviceId: 's1',
      });
      mockReviewRepository.findOne.mockResolvedValue(null);
      mockReviewRepository.create.mockReturnValue({ id: 'v1' });
      mockReviewRepository.save.mockResolvedValue({ id: 'v1' });
      medias('4.00', '1');

      await service.create('c1', DTO);

      expect(avisos.crear).toHaveBeenCalledWith(
        expect.objectContaining({
          usuarioId: 'p1',
          datos: { nota: '4' },
        }),
      );
    });

    it('avisa si la reserva no existe', async () => {
      mockBookingRepository.findOne.mockResolvedValue(null);

      await expect(service.create('c1', DTO)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('responder a una valoración', () => {
    it('solo la contesta el profesional del servicio', async () => {
      // Quien responde en público a una queja tiene que ser quien la recibió.
      mockReviewRepository.findOne.mockResolvedValue({
        id: 'v1',
        bookingId: 'b1',
      });
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'b1',
        providerId: 'p1',
      });

      await expect(
        service.addProviderResponse('v1', 'otro', {
          providerResponse: 'No fue así',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockReviewRepository.save).not.toHaveBeenCalled();
    });

    it('guarda la respuesta del profesional', async () => {
      mockReviewRepository.findOne.mockResolvedValue({
        id: 'v1',
        bookingId: 'b1',
      });
      mockBookingRepository.findOne.mockResolvedValue({
        id: 'b1',
        providerId: 'p1',
      });
      mockReviewRepository.save.mockImplementation(async (v: unknown) => v);

      const r = await service.addProviderResponse('v1', 'p1', {
        providerResponse: 'Gracias por avisar',
      });

      expect(r.providerResponse).toBe('Gracias por avisar');
    });

    it('avisa si la valoración no existe', async () => {
      mockReviewRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addProviderResponse('v1', 'p1', { providerResponse: 'Hola' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('avisa si la reserva asociada ya no está', async () => {
      mockReviewRepository.findOne.mockResolvedValue({
        id: 'v1',
        bookingId: 'b1',
      });
      mockBookingRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addProviderResponse('v1', 'p1', { providerResponse: 'Hola' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('denunciar y moderar', () => {
    const ACTOR = { id: 'admin-1', email: 'admin@servilocal.com' };

    it('la denuncia guarda el motivo alegado', async () => {
      mockReviewRepository.findOne.mockResolvedValue({ id: 'v1' });
      mockReviewRepository.save.mockImplementation(async (v: unknown) => v);

      const r = await service.reportReview('v1', {
        reportReason: 'Habla de otro profesional',
      });

      expect(r.isReported).toBe(true);
      expect(r.reportReason).toBe('Habla de otro profesional');
    });

    it('descartar la denuncia copia el motivo al historial antes de borrarlo', async () => {
      // Se limpia de la valoración, así que si no se copia aquí se pierde
      // justo la razón por la que alguien la moderó.
      mockReviewRepository.findOne.mockResolvedValue({
        id: 'v1',
        isReported: true,
        reportReason: 'Habla de otro profesional',
      });
      mockReviewRepository.save.mockImplementation(async (v: unknown) => v);

      const r = await service.dismissReport('v1', ACTOR);

      expect(r.isReported).toBe(false);
      expect(r.reportReason).toBeNull();
      expect(auditoria.anotar).toHaveBeenCalledWith(
        expect.objectContaining({
          contexto: { motivo: 'Habla de otro profesional' },
        }),
      );
    });

    it('borrar una valoración anota la nota y el comentario que desaparecen', async () => {
      mockReviewRepository.findOne.mockResolvedValue({
        id: 'v1',
        serviceId: 's1',
        rating: 1,
        comment: 'No vino ni avisó',
      });
      medias(null, '0');

      await service.deleteReview('v1', ACTOR);

      expect(auditoria.anotar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidadId: 'v1',
          contexto: { nota: '1', comentario: 'No vino ni avisó' },
        }),
      );
    });

    it('al borrar la última valoración el servicio vuelve a cero, no a NaN', async () => {
      // AVG sobre cero filas devuelve null, y parseFloat(null) es NaN: sin la
      // salvaguarda el servicio se quedaría con una media ilegible.
      mockReviewRepository.findOne.mockResolvedValue({
        id: 'v1',
        serviceId: 's1',
        rating: 5,
        comment: null,
      });
      medias(null, '0');

      await service.deleteReview('v1', ACTOR);

      expect(mockReviewRepository.remove).toHaveBeenCalled();
      expect(mockServiceRepository.update).toHaveBeenCalledWith('s1', {
        averageRating: 0,
        totalReviews: 0,
      });
    });

    it('no se borra lo que no existe', async () => {
      mockReviewRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteReview('v1', ACTOR)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockReviewRepository.remove).not.toHaveBeenCalled();
    });

    it('descartar una denuncia que no existe avisa en lugar de callar', async () => {
      mockReviewRepository.findOne.mockResolvedValue(null);

      await expect(service.dismissReport('v1', ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listados', () => {
    it('la cola de moderación trae quién valoró y qué servicio', async () => {
      // Sin las relaciones la cola sería una lista de identificadores y no
      // habría forma de decidir nada sin abrir cada caso.
      mockReviewRepository.find.mockResolvedValue([]);

      await service.findReported();

      expect(mockReviewRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isReported: true },
          relations: { client: true, service: true },
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('las de un servicio salen de la más reciente a la más antigua', async () => {
      mockReviewRepository.find.mockResolvedValue([]);

      await service.findByService('s1');

      expect(mockReviewRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceId: 's1' },
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('de quien valoró no sale ni el correo ni la dirección', async () => {
      // Esta ruta la lee cualquiera sin identificarse. Traía la fila entera
      // del cliente: correo, teléfono, dirección, código postal y
      // coordenadas. Es el mismo fallo que ya se corrigió para el proveedor
      // en la búsqueda, y que aquí se quedó sin corregir.
      mockReviewRepository.find.mockResolvedValue([]);

      await service.findByService('s1');

      const opciones = mockReviewRepository.find.mock.calls[0][0] as {
        select: { client: Record<string, boolean> };
      };
      expect(Object.keys(opciones.select.client).sort()).toEqual([
        'avatarUrl',
        'city',
        'firstName',
        'id',
        'lastName',
      ]);
    });

    it('tampoco sale el identificador de la reserva ni la denuncia', async () => {
      // El identificador permitía pedir la reserva ajena, que sí lleva el
      // domicilio; y el motivo de la denuncia es una alegación privada entre
      // el profesional y la moderación.
      mockReviewRepository.find.mockResolvedValue([]);

      await service.findByService('s1');

      const opciones = mockReviewRepository.find.mock.calls[0][0] as {
        select: Record<string, unknown>;
      };
      expect(opciones.select.bookingId).toBeUndefined();
      expect(opciones.select.reportReason).toBeUndefined();
      expect(opciones.select.comment).toBe(true);
    });

    it('las de un cliente llegan con el servicio valorado', async () => {
      mockReviewRepository.find.mockResolvedValue([]);

      await service.findByClient('c1');

      expect(mockReviewRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'c1' },
          relations: { service: true },
        }),
      );
    });
  });
});
