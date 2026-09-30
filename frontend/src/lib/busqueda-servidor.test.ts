import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarEnServidor } from './busqueda-servidor';

const pedir = vi.fn();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test/api');
  vi.stubGlobal('fetch', pedir);
  pedir.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const respuesta = (cuerpo: unknown, ok = true) => ({
  ok,
  json: async () => cuerpo,
});

describe('La búsqueda pedida desde el servidor', () => {
  it('pide la página con los nombres de la API, y la entrega en limpio', async () => {
    pedir.mockResolvedValue(
      respuesta({ data: [{ id: 's1' }], meta: { total: 30, totalPages: 3 } }),
    );

    const resultado = await buscarEnServidor({
      city: 'Sevilla',
      maxPrice: 50,
      page: 2,
    });

    const [direccion, opciones] = pedir.mock.calls[0];
    const consulta = new URL(direccion).searchParams;
    expect(direccion).toMatch(/^https:\/\/api\.test\/api\/services\/search\?/);
    expect(Object.fromEntries(consulta)).toEqual({
      city: 'Sevilla',
      priceMax: '50',
      page: '2',
    });
    // Se guarda un minuto: la misma búsqueda no vuelve a la API cada vez.
    expect(opciones.next).toEqual({ revalidate: 60 });
    expect(resultado).toEqual({
      services: [{ id: 's1' }],
      total: 30,
      totalEsParcial: false,
      totalPages: 3,
    });
  });

  it('si la API responde con un error, lo deja al navegador', async () => {
    pedir.mockResolvedValue(respuesta({}, false));

    expect(await buscarEnServidor({ page: 1 })).toBeNull();
  });

  it('si no contesta, también, sin romper la página', async () => {
    // Una API dormida tarda un minuto en despertar: la página ya está en
    // pantalla, y el navegador avisa mientras tanto.
    pedir.mockRejectedValue(new Error('timeout'));

    expect(await buscarEnServidor({ page: 1 })).toBeNull();
  });

  it('sin dirección de la API, ni lo intenta', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    expect(await buscarEnServidor({ page: 1 })).toBeNull();
    expect(pedir).not.toHaveBeenCalled();
  });
});
