import type { MetadataRoute } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routing } from '@/i18n/routing';
import { SITIO_URL } from '@/lib/sitio';
import robots from './robots';
import sitemap from './sitemap';

/** Las páginas públicas que no dependen de la base de datos. */
const RUTAS_FIJAS = ['', '/services/search', '/about', '/terms', '/privacy'];

/** Lo que robots.txt tiene que cerrar, tal como se escribe sin idioma. */
const PRIVADAS = [
  '/dashboard',
  '/bookings',
  '/admin',
  '/auth',
  '/services/*/book',
];

const IDIOMAS_CON_PREFIJO = routing.locales.filter(
  (idioma) => idioma !== routing.defaultLocale,
);

const SERVICIOS = [
  { id: 's1', updatedAt: '2026-09-20T10:00:00.000Z' },
  { id: 's2' },
];

const respuesta = (status: number, cuerpo: unknown = []) =>
  ({ status, ok: status < 400, json: async () => cuerpo }) as Response;

/** La dirección de una ruta como la publica el sitemap. */
const direccion = (idioma: string, ruta: string) =>
  idioma === routing.defaultLocale
    ? `${SITIO_URL}${ruta}`
    : `${SITIO_URL}/${idioma}${ruta}`;

const urls = (entradas: MetadataRoute.Sitemap) =>
  entradas.map((entrada) => entrada.url);

const TOTAL_FIJAS = RUTAS_FIJAS.length * routing.locales.length;

describe('sitemap', () => {
  const aviso = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.prueba/api');
    aviso.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(aviso);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('publica cada página fija en los diez idiomas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, [])),
    );

    const entradas = await sitemap();

    expect(routing.locales).toHaveLength(10);
    expect(entradas).toHaveLength(TOTAL_FIJAS);
    for (const ruta of RUTAS_FIJAS) {
      for (const idioma of routing.locales) {
        expect(urls(entradas)).toContain(direccion(idioma, ruta));
      }
    }
  });

  it('el español va sin prefijo y el resto con el suyo', async () => {
    // El enrutado es «as-needed»: /es/about no existe como URL canónica, y
    // publicarla sería anunciar un duplicado de /about.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, [])),
    );

    const publicadas = urls(await sitemap());

    expect(publicadas).toContain(SITIO_URL);
    expect(publicadas).toContain(`${SITIO_URL}/about`);
    expect(publicadas).toContain(`${SITIO_URL}/de/about`);
    expect(publicadas).toContain(`${SITIO_URL}/ar/privacy`);
    expect(publicadas.some((url) => url.startsWith(`${SITIO_URL}/es`))).toBe(
      false,
    );
  });

  it('cada página declara sus versiones en los demás idiomas', async () => {
    // Sin las alternativas, un buscador trataría las diez versiones como
    // páginas distintas con el mismo contenido.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, [])),
    );

    const entradas = await sitemap();
    const alemana = entradas.find(
      (entrada) => entrada.url === `${SITIO_URL}/de/terms`,
    );
    const idiomas = alemana?.alternates?.languages as Record<string, string>;

    expect(Object.keys(idiomas)).toEqual([...routing.locales, 'x-default']);
    expect(idiomas['x-default']).toBe(`${SITIO_URL}/terms`);
    expect(idiomas.es).toBe(`${SITIO_URL}/terms`);
    expect(idiomas.de).toBe(`${SITIO_URL}/de/terms`);
    expect(idiomas.ar).toBe(`${SITIO_URL}/ar/terms`);
  });

  it('la portada y el buscador pesan más que las páginas legales', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, [])),
    );

    const entradas = await sitemap();
    const de = (url: string) => entradas.find((entrada) => entrada.url === url);

    expect(de(SITIO_URL)).toMatchObject({
      priority: 1,
      changeFrequency: 'weekly',
    });
    expect(de(`${SITIO_URL}/services/search`)).toMatchObject({
      priority: 0.9,
      changeFrequency: 'daily',
    });
    expect(de(`${SITIO_URL}/about`)).toMatchObject({
      priority: 0.5,
      changeFrequency: 'monthly',
    });
    expect(de(`${SITIO_URL}/fr/terms`)).toMatchObject({
      priority: 0.3,
      changeFrequency: 'yearly',
    });
  });

  it('añade una ficha por servicio, solo en el idioma por defecto', async () => {
    // El texto de la ficha lo escribe el profesional en español: anunciar
    // diez versiones del mismo contenido sería engañoso.
    const pedir = vi.fn(async () => respuesta(200, SERVICIOS));
    vi.stubGlobal('fetch', pedir);

    const entradas = await sitemap();
    const fichas = entradas.filter((entrada) =>
      /\/services\/s\d+$/.test(entrada.url),
    );

    expect(pedir).toHaveBeenCalledWith(
      'http://api.prueba/api/services/search?limit=50&page=1',
      expect.objectContaining({ next: { revalidate: 3600 } }),
    );
    expect(entradas).toHaveLength(TOTAL_FIJAS + SERVICIOS.length);
    expect(urls(fichas)).toEqual([
      `${SITIO_URL}/services/s1`,
      `${SITIO_URL}/services/s2`,
    ]);
    expect(fichas[0]).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    expect(fichas[0].alternates).toBeUndefined();
  });

  it('recorre todas las páginas de la búsqueda, no solo la primera', async () => {
    // Pedía una sola página de 50: a partir del servicio 51, las fichas no
    // llegaban al sitemap.
    const pagina = (desde: number, cuantos: number) =>
      Array.from({ length: cuantos }, (_, i) => ({ id: `s${desde + i}` }));
    const pedir = vi.fn(async (url: string) => {
      const numero = Number(new URL(url).searchParams.get('page'));
      return respuesta(200, {
        data: numero === 1 ? pagina(1, 50) : pagina(51, 7),
        meta: { totalPages: 2 },
      });
    });
    vi.stubGlobal('fetch', pedir);

    const entradas = await sitemap();

    expect(pedir).toHaveBeenCalledTimes(2);
    expect(entradas).toHaveLength(TOTAL_FIJAS + 57);
    expect(urls(entradas)).toContain(`${SITIO_URL}/services/s57`);
  });

  it('si una página falla a mitad, se queda con lo que ya tenía', async () => {
    const pedir = vi
      .fn()
      .mockResolvedValueOnce(
        respuesta(200, {
          data: Array.from({ length: 50 }, (_, i) => ({ id: `s${i + 1}` })),
          meta: { totalPages: 3 },
        }),
      )
      .mockRejectedValueOnce(new Error('sin red'));
    vi.stubGlobal('fetch', pedir);

    const entradas = await sitemap();

    expect(entradas).toHaveLength(TOTAL_FIJAS + 50);
  });

  it('la fecha de una ficha es la de su última edición, si la API la da', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, SERVICIOS)),
    );

    const entradas = await sitemap();
    const ficha = (id: string) =>
      entradas.find((entrada) => entrada.url === `${SITIO_URL}/services/${id}`);
    const portada = entradas.find((entrada) => entrada.url === SITIO_URL);

    expect(ficha('s1')?.lastModified).toEqual(
      new Date('2026-09-20T10:00:00.000Z'),
    );
    // Sin fecha, toma la de generación del sitemap, como las páginas fijas.
    expect(ficha('s2')?.lastModified).toEqual(portada?.lastModified);
  });

  it('entiende también la respuesta paginada, con los servicios en data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { data: SERVICIOS, total: 2 })),
    );

    expect(await sitemap()).toHaveLength(TOTAL_FIJAS + SERVICIOS.length);
  });

  it('una respuesta sin lista no añade fichas ni rompe el sitemap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { total: 0 })),
    );

    expect(await sitemap()).toHaveLength(TOTAL_FIJAS);
  });

  it('sin la dirección de la API, omite las fichas y lo avisa', async () => {
    // Pasaría inadvertido: el sitemap se publica igual, solo que sin ningún
    // servicio, y nadie mira qué contiene.
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const pedir = vi.fn(async () => respuesta(200, SERVICIOS));
    vi.stubGlobal('fetch', pedir);

    const entradas = await sitemap();

    expect(entradas).toHaveLength(TOTAL_FIJAS);
    expect(pedir).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('NEXT_PUBLIC_API_URL'),
    );
  });

  it('si la API responde con error, publica igualmente las páginas fijas', async () => {
    // Un despliegue con la API dormida no puede quedarse sin sitemap.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(503)),
    );

    const entradas = await sitemap();

    expect(entradas).toHaveLength(TOTAL_FIJAS);
    expect(aviso).not.toHaveBeenCalled();
  });

  it('y si ni siquiera contesta, también', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      }),
    );

    expect(await sitemap()).toHaveLength(TOTAL_FIJAS);
  });
});

describe('robots.txt', () => {
  const reglas = () =>
    robots().rules as {
      userAgent: string;
      allow: string;
      disallow: string[];
    };

  it('deja rastrear lo público y apunta al sitemap', () => {
    expect(reglas()).toMatchObject({ userAgent: '*', allow: '/' });
    expect(robots().sitemap).toBe(`${SITIO_URL}/sitemap.xml`);
  });

  it('cierra las rutas privadas sin prefijo de idioma', () => {
    const { disallow } = reglas();

    for (const ruta of PRIVADAS) {
      expect(disallow).toContain(ruta);
    }
  });

  it('sin barra final, para que cierren también la propia ruta', () => {
    // robots.txt compara por prefijo: con «/dashboard/», el resumen del
    // panel, que es «/dashboard», quedaba abierto al rastreo.
    expect(reglas().disallow).not.toContain('/dashboard/');
  });

  it('y las repite con el prefijo de cada idioma', () => {
    // Sin eso, /en/dashboard quedaría abierto aunque /dashboard no lo
    // estuviera.
    const { disallow } = reglas();

    for (const ruta of PRIVADAS) {
      for (const idioma of IDIOMAS_CON_PREFIJO) {
        expect(disallow).toContain(`/${idioma}${ruta}`);
      }
    }
    expect(disallow).toHaveLength(PRIVADAS.length * routing.locales.length);
  });

  it('el idioma por defecto no se repite con prefijo, porque no lo lleva', () => {
    const { disallow } = reglas();

    expect(
      disallow.some((ruta) => ruta.startsWith(`/${routing.defaultLocale}/`)),
    ).toBe(false);
  });
});
