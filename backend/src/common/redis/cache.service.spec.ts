import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

function conCliente(cliente: unknown): CacheService {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  return new CacheService({ cliente } as RedisService);
}

describe('CacheService', () => {
  describe('sin Redis', () => {
    it('calcula siempre, sin quejarse', async () => {
      const cache = conCliente(null);
      const calcular = jest.fn(async () => ({ a: 1 }));

      expect(await cache.recordar('k', 60, calcular)).toEqual({ a: 1 });
      expect(await cache.recordar('k', 60, calcular)).toEqual({ a: 1 });
      expect(calcular).toHaveBeenCalledTimes(2);
    });
  });

  describe('con Redis', () => {
    it('devuelve lo guardado sin volver a calcular', async () => {
      const cache = conCliente({
        get: jest.fn(async () => JSON.stringify([{ id: 'c1' }])),
        set: jest.fn(),
      });
      const calcular = jest.fn();

      expect(await cache.recordar('k', 60, calcular)).toEqual([{ id: 'c1' }]);
      expect(calcular).not.toHaveBeenCalled();
    });

    it('calcula y guarda cuando no hay nada', async () => {
      const set = jest.fn(async () => 'OK');
      const cache = conCliente({ get: jest.fn(async () => null), set });

      const valor = await cache.recordar('k', 60, async () => ({ a: 2 }));

      expect(valor).toEqual({ a: 2 });
      expect(set).toHaveBeenCalledWith('k', '{"a":2}', 'EX', 60);
    });

    it('va a la base de datos si la lectura falla', async () => {
      // Render puede reiniciar la instancia sin avisar. Que eso devuelva un
      // error al usuario convertiría un acelerador en un punto único de fallo.
      const cache = conCliente({
        get: jest.fn(async () => {
          throw new Error('conexión perdida');
        }),
        set: jest.fn(),
      });

      expect(await cache.recordar('k', 60, async () => 'de la base')).toBe(
        'de la base',
      );
    });

    it('devuelve el valor aunque no se pueda guardar', async () => {
      const cache = conCliente({
        get: jest.fn(async () => null),
        set: jest.fn(async () => {
          throw new Error('memoria llena');
        }),
      });

      expect(await cache.recordar('k', 60, async () => 'calculado')).toBe(
        'calculado',
      );
    });

    it('trata un contenido corrupto como si no estuviera', async () => {
      const cache = conCliente({
        get: jest.fn(async () => 'esto no es json'),
        set: jest.fn(),
      });

      expect(await cache.recordar('k', 60, async () => 'recalculado')).toBe(
        'recalculado',
      );
    });

    it('no revienta si no se puede borrar', async () => {
      const cache = conCliente({
        del: jest.fn(async () => {
          throw new Error('caído');
        }),
      });

      await expect(cache.olvidar('k')).resolves.toBeUndefined();
    });
  });
});
