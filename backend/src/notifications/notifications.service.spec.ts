import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Notification, NotificationType } from '../entities';
import { TiempoRealGateway } from '../common/tiempo-real/tiempo-real.gateway';
import { NotificationsService } from './notifications.service';

const YO = 'u-yo';
const OTRO = 'u-otro';

async function construir(opciones: { falla?: boolean; existe?: boolean } = {}) {
  const avisos = {
    create: vi.fn((a: unknown) => a),
    save: vi.fn(async (a: unknown) => {
      if (opciones.falla) throw new Error('base caída');
      return { id: 'a1', ...(a as object) };
    }),
    find: vi.fn(async (_opciones: { take?: number }) => []),
    count: vi.fn(async () => 3),
    findOne: vi.fn(async () =>
      opciones.existe === false
        ? null
        : { id: 'a1', userId: YO, isRead: false },
    ),
    update: vi.fn(async () => ({ affected: 4 })),
  };
  const tiempoReal = { notificarAviso: vi.fn() };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      NotificationsService,
      { provide: getRepositoryToken(Notification), useValue: avisos },
      { provide: TiempoRealGateway, useValue: tiempoReal },
    ],
  }).compile();

  return { servicio: module.get(NotificationsService), avisos, tiempoReal };
}

describe('NotificationsService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  describe('crear', () => {
    it('guarda el aviso y lo empuja por socket', async () => {
      const { servicio, tiempoReal } = await construir();

      await servicio.crear({
        usuarioId: YO,
        tipo: NotificationType.BOOKING_CONFIRMED,
        enlace: '/dashboard/bookings/b1',
      });

      expect(tiempoReal.notificarAviso).toHaveBeenCalledWith(
        YO,
        expect.objectContaining({ type: NotificationType.BOOKING_CONFIRMED }),
      );
    });

    it('no guarda el texto traducido, sino el tipo y los datos', async () => {
      // Guardar «Tu reserva ha sido confirmada» dejaría ese aviso en
      // castellano para siempre, aunque quien lo lea se pase al alemán.
      const { servicio, avisos } = await construir();

      await servicio.crear({
        usuarioId: YO,
        tipo: NotificationType.NEW_REVIEW,
        datos: { nota: '5' },
      });

      const guardado = avisos.create.mock.calls[0][0] as {
        title: string;
        content: string;
      };
      expect(guardado.title).toBe(NotificationType.NEW_REVIEW);
      expect(JSON.parse(guardado.content)).toEqual({ nota: '5' });
    });

    it('no lanza si el aviso no se puede guardar', async () => {
      // Un aviso es un añadido: si confirmar una reserva fallara por no poder
      // avisar de que se ha confirmado, el remedio sería peor que la falta.
      const { servicio, tiempoReal } = await construir({ falla: true });

      await expect(
        servicio.crear({ usuarioId: YO, tipo: NotificationType.SYSTEM }),
      ).resolves.toBeNull();
      expect(tiempoReal.notificarAviso).not.toHaveBeenCalled();
    });
  });

  describe('marcar como leído', () => {
    it('marca el propio y le pone fecha', async () => {
      const { servicio } = await construir();

      const resultado = await servicio.marcarLeido('a1', YO);

      expect(resultado.isRead).toBe(true);
      expect(resultado.readAt).toBeInstanceOf(Date);
    });

    it('busca filtrando también por usuario, no solo por identificador', async () => {
      // Conocer el identificador de un aviso ajeno no debe bastar para
      // tocarlo. Es poco daño, pero es de otro.
      const { servicio, avisos } = await construir();

      await servicio.marcarLeido('a1', YO);

      expect(avisos.findOne).toHaveBeenCalledWith({
        where: { id: 'a1', userId: YO },
      });
    });

    it('avisa si no existe o no es tuyo', async () => {
      const { servicio } = await construir({ existe: false });

      await expect(servicio.marcarLeido('a1', OTRO)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resto', () => {
    it('cuenta solo los que están sin leer', async () => {
      const { servicio, avisos } = await construir();

      expect(await servicio.sinLeer(YO)).toBe(3);
      expect(avisos.count).toHaveBeenCalledWith({
        where: { userId: YO, isRead: false },
      });
    });

    it('marcar todos solo toca los no leídos del propio usuario', async () => {
      const { servicio, avisos } = await construir();

      expect(await servicio.marcarTodosLeidos(YO)).toEqual({ marcados: 4 });
      expect(avisos.update).toHaveBeenCalledWith(
        { userId: YO, isRead: false },
        expect.objectContaining({ isRead: true }),
      );
    });

    it('lista del más reciente al más antiguo, con tope', async () => {
      const { servicio, avisos } = await construir();

      await servicio.listar(YO);

      expect(avisos.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: YO },
          order: { createdAt: 'DESC' },
        }),
      );
      expect(avisos.find.mock.calls[0][0]?.take).toBeGreaterThan(0);
    });
  });
});
