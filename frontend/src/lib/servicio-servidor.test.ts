import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenerServicio, obtenerValoraciones } from './servicio-servidor';

const respuesta = (status: number, cuerpo: unknown = {}) =>
  ({ status, ok: status < 400, json: async () => cuerpo }) as Response;

describe('la ficha pedida desde el servidor', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.prueba/api');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('trae el servicio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { id: 's1' })),
    );

    expect(await obtenerServicio('s1')).toEqual({
      estado: 'ok',
      servicio: { id: 's1' },
    });
  });

  it.each([404, 400])(
    'con %i, no existe: la página responde 404',
    async (codigo) => {
      // 400 es un identificador que ni siquiera es un UUID.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => respuesta(codigo)),
      );

      expect(await obtenerServicio('s2')).toEqual({ estado: 'no-existe' });
    },
  );

  it('con la API caída no dice que no exista, o se desindexaría', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(503)),
    );
    expect(await obtenerServicio('s3')).toEqual({ estado: 'sin-respuesta' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      }),
    );
    expect(await obtenerServicio('s4')).toEqual({ estado: 'sin-respuesta' });
  });

  it('sin dirección de la API, tampoco', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    expect(await obtenerServicio('s5')).toEqual({ estado: 'sin-respuesta' });
    expect(await obtenerValoraciones('s5')).toBeNull();
  });

  it('las valoraciones, o null si no se han podido pedir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, [{ id: 'r1' }])),
    );
    expect(await obtenerValoraciones('s6')).toEqual([{ id: 'r1' }]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(500)),
    );
    expect(await obtenerValoraciones('s7')).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      }),
    );
    expect(await obtenerValoraciones('s8')).toBeNull();
  });
});
