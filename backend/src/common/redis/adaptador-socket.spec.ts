import { createServer } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import type { RedisService } from './redis.service';
import { AdaptadorSocketRedis } from './adaptador-socket';

const conexionesDelAdaptador: unknown[][] = [];
const espacios: unknown[] = [];

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: (...conexiones: unknown[]) => {
    conexionesDelAdaptador.push(conexiones);
    return class AdaptadorFalso {
      constructor(espacio: unknown) {
        espacios.push(espacio);
      }
      init() {}
      close() {}
    };
  },
}));

describe('AdaptadorSocketRedis', () => {
  beforeEach(() => {
    conexionesDelAdaptador.length = 0;
    espacios.length = 0;
  });

  const redis = (disponible: boolean) => {
    const crear = vi.fn((nombre: string) => (disponible ? { nombre } : null));
    return { crear, servicio: { crear } as unknown as RedisService };
  };

  it('sin Redis no hay adaptador, y se usa el de una sola instancia', () => {
    const { servicio } = redis(false);

    expect(
      AdaptadorSocketRedis.crear({} as INestApplicationContext, servicio),
    ).toBeNull();
    expect(conexionesDelAdaptador).toHaveLength(0);
  });

  it('con Redis, dos conexiones en modo suscripción: una publica y otra escucha', () => {
    // Una conexión suscrita no admite otros comandos, así que el adaptador
    // necesita dos, y las dos tienen que encolar mientras Redis vuelve.
    const { crear, servicio } = redis(true);

    const adaptador = AdaptadorSocketRedis.crear(
      createServer() as never,
      servicio,
    );

    expect(adaptador).toBeInstanceOf(AdaptadorSocketRedis);
    expect(crear).toHaveBeenCalledWith('socket-pub', 'suscripcion');
    expect(crear).toHaveBeenCalledWith('socket-sub', 'suscripcion');
    expect(conexionesDelAdaptador[0]).toEqual([
      { nombre: 'socket-pub' },
      { nombre: 'socket-sub' },
    ]);
  });

  it('el servidor de sockets que crea usa el adaptador de Redis', async () => {
    const { servicio } = redis(true);
    const adaptador = AdaptadorSocketRedis.crear(
      createServer() as never,
      servicio,
    )!;

    const servidor = adaptador.createIOServer(0);

    // El espacio por defecto ya se creó con el adaptador de Redis.
    expect(espacios).toContain(servidor.of('/'));
    await new Promise((listo) => servidor.close(() => listo(undefined)));
  });
});
