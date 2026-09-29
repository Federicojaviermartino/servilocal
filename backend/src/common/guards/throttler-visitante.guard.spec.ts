import {
  agruparVisitante,
  ThrottlerVisitanteGuard,
} from './throttler-visitante.guard';

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

  describe('las IPv6, por su /64', () => {
    it('dos direcciones del mismo bloque comparten contador', async () => {
      // Cada conexión recibe un /64 entero: rotar dentro de él era gratis.
      const una = await clave({
        headers: { 'cf-connecting-ip': '2a02:9130:84a0:5d1c::1' },
      });
      const otra = await clave({
        headers: {
          'cf-connecting-ip': '2a02:9130:84a0:5d1c:ffff:1234:abcd:9',
        },
      });

      expect(una).toBe('2a02:9130:84a0:5d1c::/64');
      expect(otra).toBe(una);
    });

    it('bloques vecinos no se mezclan', () => {
      expect(agruparVisitante('2a02:9130:84a0:5d1c::1')).not.toBe(
        agruparVisitante('2a02:9130:84a0:5d1d::1'),
      );
    });

    it.each([
      ['2001:0DB8:0000:0000:0001::1', '2001:db8:0:0::/64'],
      ['2001:db8::', '2001:db8:0:0::/64'],
      ['::1', '0:0:0:0::/64'],
      ['fe80::1%eth0', 'fe80:0:0:0::/64'],
      ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
      ['64:ff9b::192.0.2.1', '64:ff9b:0:0::/64'],
    ])('%s cuenta como %s', (ip, esperado) => {
      expect(agruparVisitante(ip)).toBe(esperado);
    });

    it('una IPv4, también escrita como IPv6, se queda como está', async () => {
      expect(agruparVisitante(REAL)).toBe(REAL);
      expect(agruparVisitante(`::ffff:${REAL}`)).toBe(REAL);
      expect(await clave({ ip: `::ffff:${REAL}` })).toBe(REAL);
    });

    it('lo que no es una dirección no se toca', () => {
      expect(agruparVisitante('no-es-una-ip')).toBe('no-es-una-ip');
    });
  });

  it('devuelve una clave constante cuando no hay nada fiable', async () => {
    // Compartir cubo es el lado seguro: una clave vacía o indefinida podría
    // acabar dando a cada petición la suya y desactivar el límite.
    const r = await clave({});

    expect(r).toBe('desconocido');
  });
});
