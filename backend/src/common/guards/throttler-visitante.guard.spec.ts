import { ThrottlerVisitanteGuard } from './throttler-visitante.guard';

/** Acceso al método protegido, que es justo lo que hay que comprobar. */
function clave(req: Record<string, unknown>): Promise<string> {
  const guardia = Object.create(
    ThrottlerVisitanteGuard.prototype,
  ) as ThrottlerVisitanteGuard;
  return (
    guardia as unknown as {
      getTracker(r: Record<string, unknown>): Promise<string>;
    }
  ).getTracker(req);
}

const REAL = '150.228.101.176';
const BALANCEADOR = '10.25.232.132';

describe('ThrottlerVisitanteGuard', () => {
  it('usa la cabecera de Cloudflare y no req.ip', async () => {
    // req.ip es el balanceador interno de Render y cambia entre peticiones:
    // un mismo visitante caía en dos contadores distintos.
    const r = await clave({
      headers: { 'cf-connecting-ip': REAL },
      ip: BALANCEADOR,
    });

    expect(r).toBe(REAL);
  });

  it('agrupa dos peticiones del mismo visitante aunque cambie el balanceador', async () => {
    const primera = await clave({
      headers: { 'cf-connecting-ip': REAL },
      ip: '10.25.232.132',
    });
    const segunda = await clave({
      headers: { 'cf-connecting-ip': REAL },
      ip: '10.30.151.133',
    });

    expect(primera).toBe(segunda);
  });

  it('separa a dos visitantes distintos', async () => {
    const uno = await clave({ headers: { 'cf-connecting-ip': REAL }, ip: '' });
    const otro = await clave({ headers: { 'cf-connecting-ip': '8.8.8.8' } });

    expect(uno).not.toBe(otro);
  });

  it('ignora X-Forwarded-For aunque venga', async () => {
    // Cloudflare concatena en vez de sanear, así que su primera posición la
    // pone el cliente. Leerla sería dejar que cualquiera elija su cubo.
    const r = await clave({
      headers: {
        'x-forwarded-for': '1.2.3.4, 150.228.101.176, 10.25.232.132',
        'cf-connecting-ip': REAL,
      },
      ip: BALANCEADOR,
    });

    expect(r).toBe(REAL);
  });

  it('vuelve a req.ip cuando no hay cabecera de Cloudflare', async () => {
    const r = await clave({ headers: {}, ip: BALANCEADOR });

    expect(r).toBe(BALANCEADOR);
  });

  it('no se queda con una cabecera vacía', async () => {
    const r = await clave({
      headers: { 'cf-connecting-ip': '   ' },
      ip: BALANCEADOR,
    });

    expect(r).toBe(BALANCEADOR);
  });

  it('toma la primera si llega repetida', async () => {
    const r = await clave({
      headers: { 'cf-connecting-ip': [REAL, '8.8.8.8'] },
      ip: BALANCEADOR,
    });

    expect(r).toBe(REAL);
  });

  describe('lo que llega a través del frontend', () => {
    // Cloudflare ve como visitante al servidor del frontend, el mismo para
    // todos; la dirección de verdad la manda el frontend aparte.
    const SECRETO = 'c'.repeat(32);
    const FRONTEND = '216.24.57.1';

    beforeEach(() => vi.stubEnv('PROXY_SECRETO', SECRETO));
    afterEach(() => vi.unstubAllEnvs());

    it('cuenta al visitante y no al frontend', async () => {
      const r = await clave({
        headers: {
          'cf-connecting-ip': FRONTEND,
          'x-proxy-secreto': SECRETO,
          'x-visitante-ip': REAL,
        },
        ip: BALANCEADOR,
      });

      expect(r).toBe(REAL);
    });

    it('sin el secreto bueno, la cabecera no cambia nada', async () => {
      // Quien llama directamente a la API puede mandar x-visitante-ip con lo
      // que quiera. Si bastara con eso, cada petición tendría su contador.
      const r = await clave({
        headers: {
          'cf-connecting-ip': REAL,
          'x-proxy-secreto': 'd'.repeat(32),
          'x-visitante-ip': '1.2.3.4',
        },
        ip: BALANCEADOR,
      });

      expect(r).toBe(REAL);
    });
  });

  it('devuelve una clave constante cuando no hay nada fiable', async () => {
    // Compartir cubo es el lado seguro: una clave vacía o indefinida podría
    // acabar dando a cada petición la suya y desactivar el límite.
    const r = await clave({});

    expect(r).toBe('desconocido');
  });
});
