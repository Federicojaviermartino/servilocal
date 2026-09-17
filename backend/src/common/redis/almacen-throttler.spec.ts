import Redis from 'ioredis';
import { AlmacenThrottlerTolerante } from './almacen-throttler';
import { RedisService } from './redis.service';

jest.mock('@nest-lab/throttler-storage-redis', () => ({
  ThrottlerStorageRedisService: jest.fn().mockImplementation(() => ({
    increment: (...args: unknown[]) => incrementoRedis(...args),
  })),
}));

let incrementoRedis: (...args: unknown[]) => Promise<unknown>;

function servicioRedis(conectado: boolean): RedisService {
  return {
    crear: () => (conectado ? ({} as Redis) : null),
  } as unknown as RedisService;
}

const ARGS = ['clave', 60000, 5, 0, 'default'] as const;

describe('AlmacenThrottlerTolerante', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  describe('sin REDIS_URL', () => {
    it('cuenta en memoria en lugar de dejar pasar todo', async () => {
      // Desactivar el limitador en silencio por no encontrar una
      // configuración sería peor que no haberlo puesto: nadie se enteraría.
      const almacen = new AlmacenThrottlerTolerante(servicioRedis(false));

      const primero = await almacen.increment(...ARGS);
      const segundo = await almacen.increment(...ARGS);

      expect(primero.totalHits).toBe(1);
      expect(segundo.totalHits).toBe(2);
    });
  });

  describe('con Redis', () => {
    it('devuelve lo que diga Redis', async () => {
      incrementoRedis = jest.fn(async () => ({
        totalHits: 7,
        timeToExpire: 42,
        isBlocked: false,
        timeToBlockExpire: 0,
      }));
      const almacen = new AlmacenThrottlerTolerante(servicioRedis(true));

      const registro = await almacen.increment(...ARGS);

      expect(registro.totalHits).toBe(7);
      expect(registro.timeToExpire).toBe(42);
    });

    it('respeta el bloqueo que venga de Redis', async () => {
      incrementoRedis = jest.fn(async () => ({
        totalHits: 99,
        timeToExpire: 10,
        isBlocked: true,
        timeToBlockExpire: 30,
      }));
      const almacen = new AlmacenThrottlerTolerante(servicioRedis(true));

      expect((await almacen.increment(...ARGS)).isBlocked).toBe(true);
    });

    it('deja pasar la petición si Redis no responde', async () => {
      // La alternativa es devolver un error a todo el mundo porque se ha
      // caído el contador: tumbar el sitio entero para proteger un límite
      // de tráfico.
      incrementoRedis = jest.fn(async () => {
        throw new Error('conexión rechazada');
      });
      const almacen = new AlmacenThrottlerTolerante(servicioRedis(true));

      const registro = await almacen.increment(...ARGS);

      expect(registro.isBlocked).toBe(false);
      expect(registro.totalHits).toBe(1);
    });

    it('no repliega a memoria cuando Redis falla, para no contar dos veces', async () => {
      // Con varias instancias, cada una llevaría su propia cuenta y el
      // límite real se multiplicaría sin que nadie lo supiera. Mejor no
      // limitar y decirlo, que limitar mal y callarlo.
      incrementoRedis = jest.fn(async () => {
        throw new Error('caído');
      });
      const almacen = new AlmacenThrottlerTolerante(servicioRedis(true));

      const primero = await almacen.increment(...ARGS);
      const segundo = await almacen.increment(...ARGS);

      expect(primero.totalHits).toBe(1);
      expect(segundo.totalHits).toBe(1);
    });

    it('vuelve a usar Redis en cuanto responde otra vez', async () => {
      let caido = true;
      incrementoRedis = jest.fn(async () => {
        if (caido) throw new Error('caído');
        return {
          totalHits: 3,
          timeToExpire: 10,
          isBlocked: false,
          timeToBlockExpire: 0,
        };
      });
      const almacen = new AlmacenThrottlerTolerante(servicioRedis(true));

      await almacen.increment(...ARGS);
      caido = false;

      expect((await almacen.increment(...ARGS)).totalHits).toBe(3);
    });
  });
});
