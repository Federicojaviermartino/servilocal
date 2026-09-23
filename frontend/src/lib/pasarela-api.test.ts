import { describe, expect, it } from 'vitest';
import { cabecerasHaciaLaApi, destinoEnLaApi } from './pasarela-api';

const SECRETO = 's'.repeat(64);
const VISITANTE = '150.228.101.176';

/** Lo que llega al frontend desde Cloudflare en producción. */
function comoEnProduccion(extra: Record<string, string> = {}): Headers {
  return new Headers({
    accept: 'application/json',
    'content-type': 'application/json',
    cookie: 'sesion=eyJ.x.y; NEXT_LOCALE=es',
    origin: 'https://servilocal-web.onrender.com',
    'cf-connecting-ip': VISITANTE,
    'cf-ray': '8c1f2e3d4a5b6c7d-MAD',
    'cf-ipcountry': 'ES',
    'cf-visitor': '{"scheme":"https"}',
    'cdn-loop': 'cloudflare; loops=1',
    'x-forwarded-for': `${VISITANTE}, 10.25.232.132`,
    'x-forwarded-proto': 'https',
    'true-client-ip': VISITANTE,
    ...extra,
  });
}

describe('cabecerasHaciaLaApi', () => {
  it('no deja pasar ninguna de Cloudflare', () => {
    // El borde de la API rechaza con un 403 una petición que ya traiga
    // cf-connecting-ip, y cdn-loop le haría ver un bucle. Reenviadas tal
    // cual, todas las llamadas a la API fallarían en producción.
    const salientes = cabecerasHaciaLaApi(comoEnProduccion(), SECRETO);

    const nombres = Array.from(salientes.keys());
    expect(nombres.filter((n) => n.startsWith('cf-'))).toEqual([]);
    expect(salientes.has('cdn-loop')).toBe(false);
    expect(salientes.has('true-client-ip')).toBe(false);
    expect(salientes.has('x-forwarded-for')).toBe(false);
    expect(salientes.has('x-forwarded-proto')).toBe(false);
  });

  it('lleva la cookie de sesión y el origen, que son la petición', () => {
    const salientes = cabecerasHaciaLaApi(comoEnProduccion(), SECRETO);

    expect(salientes.get('cookie')).toBe('sesion=eyJ.x.y; NEXT_LOCALE=es');
    // Sin Origin, la API no podría rechazar lo que llega de otra web.
    expect(salientes.get('origin')).toBe('https://servilocal-web.onrender.com');
    expect(salientes.get('content-type')).toBe('application/json');
  });

  it('manda la dirección del visitante con el secreto', () => {
    const salientes = cabecerasHaciaLaApi(comoEnProduccion(), SECRETO);

    expect(salientes.get('x-visitante-ip')).toBe(VISITANTE);
    expect(salientes.get('x-proxy-secreto')).toBe(SECRETO);
  });

  it('sin secreto no manda ninguna de las dos', () => {
    // La API no la creería, y mandarla sola solo enseñaría el formato.
    const salientes = cabecerasHaciaLaApi(comoEnProduccion(), undefined);

    expect(salientes.has('x-visitante-ip')).toBe(false);
    expect(salientes.has('x-proxy-secreto')).toBe(false);
  });

  it('sin Cloudflare delante no se inventa la dirección', () => {
    // En local no hay nada fiable: X-Forwarded-For lo puede escribir quien
    // llama, y reenviarlo le dejaría elegir su propio contador.
    const salientes = cabecerasHaciaLaApi(
      new Headers({ 'x-forwarded-for': '1.2.3.4' }),
      SECRETO,
    );

    expect(salientes.has('x-visitante-ip')).toBe(false);
    expect(salientes.has('x-proxy-secreto')).toBe(false);
  });

  it('lo que diga el navegador sobre el proxy se tira', () => {
    // Alguien que manda sus propias x-visitante-ip y x-proxy-secreto al
    // frontend no puede conseguir que lleguen a la API.
    const salientes = cabecerasHaciaLaApi(
      comoEnProduccion({
        'x-visitante-ip': '6.6.6.6',
        'x-proxy-secreto': 'adivinado',
      }),
      undefined,
    );

    expect(salientes.has('x-visitante-ip')).toBe(false);
    expect(salientes.has('x-proxy-secreto')).toBe(false);
  });

  it('y con secreto, la dirección es la de Cloudflare, no la suya', () => {
    const salientes = cabecerasHaciaLaApi(
      comoEnProduccion({ 'x-visitante-ip': '6.6.6.6' }),
      SECRETO,
    );

    expect(salientes.get('x-visitante-ip')).toBe(VISITANTE);
  });
});

describe('destinoEnLaApi', () => {
  it('la misma ruta y la misma consulta, en el servidor de la API', () => {
    const destino = destinoEnLaApi(
      '/api/services/search',
      '?city=Madrid&limit=12',
      'https://servilocal-api.onrender.com/api',
    );

    expect(destino.href).toBe(
      'https://servilocal-api.onrender.com/api/services/search?city=Madrid&limit=12',
    );
  });

  it('en local, con puerto', () => {
    expect(
      destinoEnLaApi('/api/auth/login', '', 'http://localhost:3001/api').href,
    ).toBe('http://localhost:3001/api/auth/login');
  });

  it('una ruta rara no saca la petición del servidor de la API', () => {
    // Un // al principio convertiría la ruta en otro servidor si se juntara
    // a mano; con URL y un origen fijo, sigue siendo una ruta.
    const destino = destinoEnLaApi(
      '/api//ajena.example/x',
      '',
      'https://servilocal-api.onrender.com/api',
    );

    expect(destino.origin).toBe('https://servilocal-api.onrender.com');
  });
});
