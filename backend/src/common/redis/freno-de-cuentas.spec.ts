import { HttpException, Logger } from '@nestjs/common';
import {
  CODIGO_CUENTA_FRENADA,
  FRENO_DE_CUENTA,
  FrenoDeCuentas,
} from './freno-de-cuentas';
import type { RedisService } from './redis.service';

const CORREO = 'ana@correo.test';
const { maximo, ventanaMs } = FRENO_DE_CUENTA;

/** Lo que haría Redis con las cinco órdenes que usa el freno. */
function redisDeMentira() {
  const valores = new Map<string, { valor: number; caduca: number | null }>();
  const vivo = (clave: string) => {
    const entrada = valores.get(clave);
    if (entrada?.caduca && entrada.caduca <= Date.now()) valores.delete(clave);
    return valores.get(clave);
  };
  const cliente = {
    get: vi.fn(async (clave: string) => vivo(clave)?.valor.toString() ?? null),
    incr: vi.fn(async (clave: string) => {
      const entrada = vivo(clave) ?? { valor: 0, caduca: null };
      entrada.valor += 1;
      valores.set(clave, entrada);
      return entrada.valor;
    }),
    pttl: vi.fn(async (clave: string) => {
      const entrada = vivo(clave);
      if (!entrada) return -2;
      return entrada.caduca ? entrada.caduca - Date.now() : -1;
    }),
    pexpire: vi.fn(async (clave: string, ms: number) => {
      const entrada = vivo(clave);
      if (entrada) entrada.caduca = Date.now() + ms;
      return entrada ? 1 : 0;
    }),
    del: vi.fn(async (clave: string) => (valores.delete(clave) ? 1 : 0)),
  };
  return { cliente, valores };
}

const fallar = async (
  freno: FrenoDeCuentas,
  veces: number,
  correo = CORREO,
) => {
  for (let i = 0; i < veces; i += 1) await freno.anotarFallo(correo);
};

const rechazo = async (freno: FrenoDeCuentas, correo = CORREO) =>
  freno.comprobar(correo).then(
    () => null,
    (error: HttpException) => error,
  );

describe('FrenoDeCuentas', () => {
  let aviso: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z') });
    aviso = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe.each([
    ['en memoria, sin Redis', () => ({ cliente: null })],
    ['en Redis', () => redisDeMentira()],
  ])('%s', (_donde, crear) => {
    let freno: FrenoDeCuentas;

    beforeEach(() => {
      freno = new FrenoDeCuentas(crear() as unknown as RedisService);
    });

    it('por debajo del tope no dice nada', async () => {
      await fallar(freno, maximo - 1);

      expect(await rechazo(freno)).toBeNull();
    });

    it('al llegar al tope rechaza con un 429, su código y cuánto falta', async () => {
      await fallar(freno, maximo);

      const error = await rechazo(freno);

      expect(error?.getStatus()).toBe(429);
      expect(error?.getResponse()).toEqual({
        statusCode: 429,
        codigo: CODIGO_CUENTA_FRENADA,
        message: expect.stringContaining('espera unos minutos'),
        reintentarEn: ventanaMs / 1000,
      });
    });

    it('la ventana empieza con el primer fallo y no se alarga con los demás', async () => {
      // Si cada fallo la renovara, bastaría con seguir fallando para tener
      // a alguien fuera de su cuenta todo el tiempo que se quisiera.
      await freno.anotarFallo(CORREO);
      vi.advanceTimersByTime(ventanaMs - 60_000);
      await fallar(freno, maximo - 1);

      const error = await rechazo(freno);
      expect(
        (error?.getResponse() as { reintentarEn: number }).reintentarEn,
      ).toBe(60);

      vi.advanceTimersByTime(60_000);
      expect(await rechazo(freno)).toBeNull();
    });

    it('el correo es el mismo con mayúsculas o con espacios alrededor', async () => {
      await fallar(freno, maximo, '  Ana@Correo.Test ');

      expect(await rechazo(freno)).not.toBeNull();
    });

    it('cada cuenta lleva su cuenta', async () => {
      await fallar(freno, maximo);

      expect(await rechazo(freno, 'otra@correo.test')).toBeNull();
    });

    it('olvidar la deja como nueva', async () => {
      await fallar(freno, maximo);

      await freno.olvidar(CORREO);

      expect(await rechazo(freno)).toBeNull();
      await fallar(freno, maximo - 1);
      expect(await rechazo(freno)).toBeNull();
    });

    it('lo deja dicho al echar el freno, una vez y sin el correo', async () => {
      await fallar(freno, maximo + 3);

      expect(aviso).toHaveBeenCalledTimes(1);
      const [linea] = aviso.mock.calls[0] as [string];
      expect(linea).toContain(`${maximo} contraseñas equivocadas`);
      expect(linea).not.toContain('ana');
    });
  });

  describe('lo que se guarda', () => {
    it('en Redis va la huella del correo, no el correo', async () => {
      const { cliente, valores } = redisDeMentira();
      const freno = new FrenoDeCuentas({ cliente } as unknown as RedisService);

      await freno.anotarFallo(CORREO);

      const [clave] = [...valores.keys()];
      expect(clave).toMatch(/^freno-de-cuenta:[0-9a-f]{64}$/);
      expect(clave).not.toContain('ana');
    });

    it('una clave que se quedara sin caducidad la recupera en el siguiente fallo', async () => {
      // Sin esto, un corte entre sumar y poner la caducidad frenaría esa
      // cuenta para siempre.
      const { cliente, valores } = redisDeMentira();
      const freno = new FrenoDeCuentas({ cliente } as unknown as RedisService);
      await freno.anotarFallo(CORREO);
      const [entrada] = [...valores.values()];
      entrada.caduca = null;

      await freno.anotarFallo(CORREO);

      expect(entrada.caduca).toBe(Date.now() + ventanaMs);
    });

    it('en memoria no crece sin fin por mucho correo distinto que se pruebe', async () => {
      const freno = new FrenoDeCuentas({
        cliente: null,
      } as unknown as RedisService);
      for (let i = 0; i < 5200; i += 1) {
        await freno.anotarFallo(`inventado-${i}@correo.test`);
      }
      const guardadas = (
        freno as unknown as { enMemoria: Map<string, unknown> }
      ).enMemoria;

      expect(guardadas.size).toBeLessThanOrEqual(5000);
      // Y se han ido las más antiguas, no las recientes.
      await fallar(freno, maximo - 1, 'inventado-5199@correo.test');
      expect(await rechazo(freno, 'inventado-5199@correo.test')).not.toBeNull();
    });
  });

  describe('con Redis caído', () => {
    const caido = () => {
      const fallo = async () => {
        throw new Error('Connection is closed.');
      };
      return {
        cliente: {
          get: fallo,
          incr: fallo,
          pttl: fallo,
          pexpire: fallo,
          del: fallo,
        },
      } as unknown as RedisService;
    };

    it('sigue frenando, contando en memoria', async () => {
      const freno = new FrenoDeCuentas(caido());

      await fallar(freno, maximo);

      expect((await rechazo(freno))?.getStatus()).toBe(429);
    });

    it('y lo avisa una sola vez, no en cada petición', async () => {
      const freno = new FrenoDeCuentas(caido());

      await fallar(freno, 3);
      await rechazo(freno);
      await freno.olvidar(CORREO);

      const deRedis = aviso.mock.calls.filter((llamada: unknown[]) =>
        String(llamada[0]).includes('Redis no responde'),
      );
      expect(deRedis).toHaveLength(1);
    });
  });
});
