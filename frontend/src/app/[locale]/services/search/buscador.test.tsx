import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import type { Service } from '@/types';
import {
  filtrosDeUrl,
  paginaDeUrl,
  urlDeBusqueda,
  vistaDeUrl,
  type ResultadoBusqueda,
} from '@/lib/busqueda';
import Buscador from './buscador';
import SearchPage, { generateMetadata } from './page';

const buscar = vi.fn();
const buscarEnServidor = vi.fn();
const reemplazar = vi.fn();
const empujar = vi.fn();
const desplazar = vi.fn((): ScrollBehavior => 'smooth');
const desplazarVentana = vi.fn();

vi.mock('@/lib/api', () => ({
  servicesApi: { search: (filtros: unknown) => buscar(filtros) },
  // El panel de filtros pide las categorías al montarse; aquí no cuentan.
  categoriesApi: { getAll: async () => ({ data: [] }) },
}));

// Los textos, del catálogo en castellano: el servidor de next-intl no existe
// en estas pruebas.
vi.mock('next-intl/server', () => ({
  getTranslations:
    async ({ namespace }: { namespace: 'meta' }) =>
    (clave: string) =>
      (es[namespace] as Record<string, string>)[clave],
}));

vi.mock('@/lib/busqueda-servidor', () => ({
  buscarEnServidor: (peticion: unknown) => buscarEnServidor(peticion),
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
    // Como el de next-intl: la ruta, con el prefijo del idioma.
    getPathname: ({ href, locale }: { href: string; locale: string }) =>
      locale === 'es' ? href : `/${locale}${href}`,
    useRouter: () => ({ replace: reemplazar, push: empujar }),
    usePathname: () => '/services/search',
  };
});

// Si se ha pedido menos movimiento lo decide desplazamiento(), que tiene sus
// propias pruebas. Aquí basta con que el salto use lo que diga.
vi.mock('@/lib/movimiento', () => ({ desplazamiento: () => desplazar() }));

// El asistente tiene sus propias pruebas.
vi.mock('@/components/organisms/AsistenteBusqueda', () => ({
  default: () => null,
}));

// Leaflet no pinta en jsdom, y el mapa también tiene sus propias pruebas:
// aquí basta con saber que se pinta y con cuántos servicios.
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: () =>
      function MapaDePrueba({ services }: { services: Service[] }) {
        return React.createElement(
          'div',
          { 'data-testid': 'mapa' },
          `${services.length} en el mapa`,
        );
      },
  };
});

const servicio = (id: string, title: string) =>
  ({
    id,
    title,
    description: 'Arreglos en el día, con presupuesto cerrado.',
    city: 'Sevilla',
    priceMin: 40,
    priceUnit: 'por hora',
    averageRating: 4.5,
    totalReviews: 3,
    images: [],
  }) as unknown as Service;

const GRIFO = servicio('s1', 'Reparación de grifos');
const LUZ = servicio('s2', 'Instalación de enchufes');

const resultado = (
  services: Service[],
  extra: Partial<ResultadoBusqueda> = {},
): ResultadoBusqueda => ({
  services,
  total: services.length,
  totalEsParcial: false,
  totalPages: 1,
  ...extra,
});

/** La respuesta de la API desde el navegador, como la envuelve axios. */
const respuestaApi = (services: Service[], meta: object = {}) => ({
  data: {
    data: services,
    meta: { total: services.length, totalPages: 1, ...meta },
  },
});

/** Una respuesta que llega cuando la prueba quiere. */
function aplazada<T>() {
  let responder!: (valor: T) => void;
  const promesa = new Promise<T>((resolver) => {
    responder = resolver;
  });
  return { promesa, responder };
}

/** El buscador como lo sirve la página para una dirección. */
function buscadorPara(
  url: string,
  primera: Promise<ResultadoBusqueda | null>,
): ReactElement {
  const parametros = new URLSearchParams(url);
  const filtros = filtrosDeUrl(parametros);
  const vista = vistaDeUrl(parametros);
  const pagina = vista === 'map' ? 1 : paginaDeUrl(parametros);
  const claveUrl = urlDeBusqueda(filtros, vista, pagina);
  return (
    <NextIntlClientProvider locale="es" messages={es as never}>
      <Buscador
        key={claveUrl}
        claveUrl={claveUrl}
        filtros={filtros}
        vista={vista}
        pagina={pagina}
        primera={primera}
      />
    </NextIntlClientProvider>
  );
}

let pintado: ReturnType<typeof render>;

/**
 * Dentro de un act asíncrono: los resultados llegan en una promesa, y un
 * componente que la espera solo vuelve a pintarse si act la ve resolverse.
 */
const pintar = async (
  url = '',
  primera: Promise<ResultadoBusqueda | null> = Promise.resolve(
    resultado([GRIFO]),
  ),
) => {
  await act(async () => {
    pintado = render(buscadorPara(url, primera));
  });
  return pintado;
};

/**
 * Lo que haría el enrutador tras cambiar la dirección: la página se vuelve
 * a servir con ella.
 */
const navegarA = async (
  url: string,
  primera: Promise<ResultadoBusqueda | null> = Promise.resolve(
    resultado([GRIFO]),
  ),
) => {
  await act(async () => {
    pintado.rerender(buscadorPara(url.split('?')[1] ?? '', primera));
  });
};

const pulsar = (nombre: string) =>
  userEvent.click(screen.getByRole('button', { name: nombre }));

const irAPagina = (numero: number) =>
  pulsar(es.paginacion.pagina.replace('{numero}', String(numero)));

const navegacion = () =>
  screen.queryByRole('navigation', { name: es.paginacion.navegacion });

const titulo = () =>
  screen.getByRole('heading', { level: 1, name: es.resultados.titulo });

/** El recuento que se ve junto a la lista. */
const visible = (texto: string) =>
  screen.getByText(texto, { ignore: '.sr-only' });

/** Y el que oye quien usa un lector de pantalla. */
const anunciado = () =>
  screen
    .getAllByRole('status')
    .find((region) => region.classList.contains('sr-only')) as HTMLElement;

beforeEach(() => {
  buscar.mockReset();
  buscarEnServidor.mockReset();
  reemplazar.mockReset();
  empujar.mockReset();
  desplazar.mockClear();
  desplazarVentana.mockReset();
  // jsdom no se desplaza: solo se comprueba que se pide.
  window.scrollTo = desplazarVentana as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('El título de la pestaña', () => {
  const tituloDe = async (recibidos: Record<string, string>) =>
    (
      await generateMetadata({
        params: Promise.resolve({ locale: 'es' }),
        searchParams: Promise.resolve(recibidos),
      })
    ).title;

  it('lleva lo que se busca y dónde, delante', async () => {
    // Era siempre «Buscar servicios»: tres búsquedas abiertas eran tres
    // pestañas iguales, y al cambiar de búsqueda Next no anunciaba nada,
    // porque solo habla cuando el título cambia.
    expect(await tituloDe({ q: 'fontanero', city: 'Valencia' })).toBe(
      'fontanero · Valencia · Buscar servicios',
    );
    expect(await tituloDe({ city: 'Valencia' })).toBe(
      'Valencia · Buscar servicios',
    );
  });

  it('sin nada que buscar, el de siempre', async () => {
    expect(await tituloDe({})).toBe('Buscar servicios');
  });

  it('una búsqueda larguísima no se come el nombre de la página', async () => {
    const titulo = String(await tituloDe({ q: 'a'.repeat(500) }));

    expect(titulo.length).toBeLessThan(100);
    expect(titulo.endsWith('Buscar servicios')).toBe(true);
  });
});

describe('La página del servidor', () => {
  /** El buscador que devuelve la página, con sus props. */
  async function servir(recibidos: Record<string, string | string[]>) {
    buscarEnServidor.mockResolvedValue(resultado([GRIFO]));
    const arbol = (await SearchPage({
      searchParams: Promise.resolve(recibidos),
    })) as ReactElement<{ children: ReactElement[] }>;
    return arbol.props.children[0] as ReactElement<{
      claveUrl: string;
      filtros: object;
      pagina: number;
    }>;
  }

  it('lee la dirección y pide ya la primera página, sin esperarla', async () => {
    // El HTML llegaba sin título, sin filtros y sin un enlace a una ficha.
    const buscador = await servir({ q: 'grifo', city: 'Sevilla', page: '2' });

    expect(buscador.props.filtros).toMatchObject({
      query: 'grifo',
      city: 'Sevilla',
    });
    expect(buscador.props.pagina).toBe(2);
    expect(buscador.key).toBe('q=grifo&city=Sevilla&page=2');
    expect(buscarEnServidor).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'grifo', city: 'Sevilla', page: 2 }),
    );
  });

  it('un parámetro repetido cuenta una vez, el primero', async () => {
    const buscador = await servir({ city: ['Sevilla', 'Málaga'] });

    expect(buscador.props.filtros).toMatchObject({ city: 'Sevilla' });
  });

  it('el mapa no se pagina, aunque la dirección traiga página', async () => {
    const buscador = await servir({ view: 'map', page: '3' });

    expect(buscador.props.pagina).toBe(1);
    expect(buscarEnServidor).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 50 }),
    );
  });
});

describe('El buscador', () => {
  it('pinta lo que trajo el servidor, sin buscar desde el navegador', async () => {
    await pintar(
      'q=grifo&city=Sevilla',
      Promise.resolve(resultado([GRIFO, LUZ], { total: 25, totalPages: 3 })),
    );

    expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
    expect(screen.getByText(LUZ.title)).toBeInTheDocument();
    expect(visible('25 resultados encontrados')).toBeInTheDocument();
    expect(navegacion()).toBeInTheDocument();
    expect(buscar).not.toHaveBeenCalled();
  });

  it('cuántos hay se le dice también a quien no ve la pantalla', async () => {
    // El recuento que se ve aparece ya escrito, con la lista, y así no se
    // anuncia. El que se anuncia está en la página desde el principio,
    // vacío, y se escribe cuando llegan los resultados.
    const respuesta = aplazada<ResultadoBusqueda | null>();
    await pintar('q=grifo', respuesta.promesa);
    expect(anunciado()).toBeEmptyDOMElement();

    await act(async () => {
      respuesta.responder(resultado([GRIFO, LUZ], { total: 25 }));
    });

    await waitFor(() =>
      expect(anunciado()).toHaveTextContent('25 resultados encontrados'),
    );
  });

  it('y si no hay ninguno, también', async () => {
    await pintar('q=nada', Promise.resolve(resultado([], { total: 0 })));

    await waitFor(() =>
      expect(anunciado()).toHaveTextContent('Ningún resultado'),
    );
  });

  it('la barra y los filtros reflejan lo que trae la URL', async () => {
    // Un enlace compartido o una recarga tienen que dar la misma búsqueda.
    await pintar('q=grifo&category=c1&city=Sevilla');
    await screen.findByText(GRIFO.title);

    expect(
      screen.getByRole('searchbox', { name: es.buscador.buscarServicios }),
    ).toHaveValue('grifo');
    expect(screen.getByLabelText(es.filtros.ciudad)).toHaveValue('Sevilla');
  });

  it('si el servidor no obtuvo respuesta, busca el navegador con lo de la URL', async () => {
    buscar.mockResolvedValue(respuestaApi([GRIFO]));

    await pintar('city=Sevilla&maxPrice=50&page=2', Promise.resolve(null));

    expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
    expect(buscar).toHaveBeenCalledWith({
      city: 'Sevilla',
      maxPrice: 50,
      page: 2,
    });
  });

  it('si el servidor dejó de contar, no da el total por exacto', async () => {
    await pintar(
      '',
      Promise.resolve(
        resultado([GRIFO], {
          total: 1000,
          totalPages: 84,
          totalEsParcial: true,
        }),
      ),
    );

    await screen.findByText(GRIFO.title);
    expect(visible('Más de 1000 resultados encontrados')).toBeInTheDocument();
    expect(anunciado()).toHaveTextContent('Más de 1000 resultados encontrados');
  });

  it('sin resultados lo dice, y no ofrece páginas', async () => {
    await pintar('', Promise.resolve(resultado([])));

    expect(
      await screen.findByText(es.resultados.sinResultados),
    ).toBeInTheDocument();
    expect(navegacion()).toBeNull();
  });

  describe('si la búsqueda falla', () => {
    it.each([
      ['tarda demasiado', { code: 'ECONNABORTED' }, es.resultados.errorTimeout],
      ['no hay red', new Error('Network Error'), es.resultados.errorRed],
      [
        'la API responde con un error',
        { response: { status: 503 } },
        es.resultados.errorServicio,
      ],
    ])('porque %s, lo explica y deja reintentar', async (_c, fallo, texto) => {
      // Una lista vacía diría «no hay servicios», que es otra cosa.
      buscar
        .mockRejectedValueOnce(fallo)
        .mockResolvedValueOnce(respuestaApi([GRIFO]));

      await pintar('', Promise.resolve(null));

      expect(await screen.findByRole('alert')).toHaveTextContent(texto);
      expect(screen.queryByText(es.resultados.sinResultados)).toBeNull();
      expect(navegacion()).toBeNull();

      await pulsar(es.comun.reintentar);

      expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
      expect(buscar).toHaveBeenCalledTimes(2);
      expect(buscar).toHaveBeenLastCalledWith({ page: 1 });
    });
  });

  it('mientras llegan los resultados lo anuncia, y si tardan explica que el servidor está despertando', async () => {
    // La instancia gratuita tarda en arrancar tras un rato sin uso. Mejor
    // decirlo que dejar a nadie mirando un indicador mudo. La página ya
    // está en pantalla: solo esperan los resultados.
    vi.useFakeTimers();
    const respuesta = aplazada<ResultadoBusqueda | null>();

    await pintar('', respuesta.promesa);

    expect(titulo()).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: es.resultados.cargando }),
    ).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(screen.queryByText(es.resultados.despertando)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText(es.resultados.despertando)).toBeInTheDocument();

    await act(async () => {
      respuesta.responder(resultado([GRIFO]));
    });
    expect(screen.getByText(GRIFO.title)).toBeInTheDocument();
    expect(screen.queryByText(es.resultados.despertando)).toBeNull();
  });

  describe('la paginación', () => {
    it('la página va en la URL, como una entrada más del historial', async () => {
      // Quien volvía atrás desde una ficha abierta en la página 3
      // aterrizaba en la 1.
      await pintar(
        'q=grifo',
        Promise.resolve(resultado([GRIFO], { total: 30, totalPages: 3 })),
      );
      await screen.findByText(GRIFO.title);

      await irAPagina(2);

      expect(empujar).toHaveBeenCalledWith('/services/search?q=grifo&page=2', {
        scroll: false,
      });
      expect(desplazar).toHaveBeenCalled();
      expect(desplazarVentana).toHaveBeenCalledWith({
        top: 0,
        behavior: 'smooth',
      });
    });

    it('la página nueva llega con el foco en el título', async () => {
      // Con teclado o lector de pantalla, el foco se quedaba en el botón del
      // pie y nada decía que la lista había cambiado.
      const tres = () =>
        Promise.resolve(resultado([GRIFO], { total: 30, totalPages: 3 }));
      await pintar('', tres());
      await screen.findByText(GRIFO.title);

      await irAPagina(2);
      await navegarA('/services/search?page=2', tres());
      await screen.findByText(GRIFO.title);

      expect(titulo()).toHaveFocus();
      expect(
        screen.getByRole('button', {
          name: es.paginacion.pagina.replace('{numero}', '2'),
        }),
      ).toHaveAttribute('aria-current', 'page');
    });

    it('aplicar un filtro también lo lleva al título', async () => {
      // La búsqueda nueva es otro componente: sin esto el foco caía en el
      // documento, y el siguiente tabulador empezaba desde lo alto de la
      // página.
      await pintar('q=grifo');
      await screen.findByText(GRIFO.title);

      await userEvent.selectOptions(
        screen.getByLabelText(es.filtros.ciudad),
        'Sevilla',
      );
      await pulsar(es.filtros.aplicar);
      await navegarA('/services/search?q=grifo&city=Sevilla');
      await screen.findByText(GRIFO.title);

      expect(titulo()).toHaveFocus();
    });

    it('llegar por un enlace no roba el foco', async () => {
      await pintar(
        'page=2',
        Promise.resolve(resultado([GRIFO], { totalPages: 3 })),
      );
      await screen.findByText(GRIFO.title);

      expect(titulo()).not.toHaveFocus();
    });
  });

  describe('lista o mapa', () => {
    const lista = () =>
      screen.getByRole('button', { name: es.resultados.vistaLista });
    const mapa = () =>
      screen.getByRole('button', { name: es.resultados.vistaMapa });

    it('la vista activa se anuncia, no solo con el color, y va en la URL', async () => {
      await pintar();
      await screen.findByText(GRIFO.title);

      expect(lista()).toHaveAttribute('aria-pressed', 'true');
      expect(mapa()).toHaveAttribute('aria-pressed', 'false');

      await userEvent.click(mapa());
      // Un enlace abre la misma vista que se veía.
      expect(reemplazar).toHaveBeenLastCalledWith('/services/search?view=map');
      await navegarA('/services/search?view=map');

      expect(lista()).toHaveAttribute('aria-pressed', 'false');
      expect(mapa()).toHaveAttribute('aria-pressed', 'true');
    });

    it('tras cambiar de vista, el foco sigue en el botón que se pulsó', async () => {
      // Llevárselo al título obligaría a volver hasta aquí para probar la
      // otra vista; dejarlo caer en el documento, a recorrer la página.
      await pintar();
      await screen.findByText(GRIFO.title);

      await userEvent.click(mapa());
      await navegarA('/services/search?view=map');

      expect(mapa()).toHaveFocus();
    });

    it('el mapa enseña todo lo que llegó, sin paginar', async () => {
      await pintar(
        'view=map',
        Promise.resolve(resultado([GRIFO, LUZ], { totalPages: 3 })),
      );

      expect(await screen.findByTestId('mapa')).toHaveTextContent(
        '2 en el mapa',
      );
      expect(screen.queryByText(GRIFO.title)).toBeNull();
      expect(navegacion()).toBeNull();
    });

    it('desde el navegador, el mapa pide todo lo que admite la API', async () => {
      // Quien abre un mapa espera ver todo lo del área, no doce resultados.
      buscar.mockResolvedValue(respuestaApi([GRIFO, LUZ]));

      await pintar('view=map', Promise.resolve(null));

      await screen.findByTestId('mapa');
      expect(buscar).toHaveBeenCalledWith({ page: 1, limit: 50 });
    });

    it('cambiar de vista vuelve a la primera página', async () => {
      await pintar(
        'page=3',
        Promise.resolve(resultado([GRIFO], { totalPages: 3 })),
      );
      await screen.findByText(GRIFO.title);

      await userEvent.click(mapa());

      expect(reemplazar).toHaveBeenLastCalledWith('/services/search?view=map');
    });

    it('pulsar la vista que ya está activa no hace nada', async () => {
      await pintar();
      await screen.findByText(GRIFO.title);

      await userEvent.click(lista());

      expect(reemplazar).not.toHaveBeenCalled();
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  it('aplicar filtros los lleva a la URL, con el texto buscado, desde la primera página', async () => {
    // Los del panel no se escribían nunca en la dirección: se perdían al
    // recargar o al volver atrás, y un enlace no los llevaba.
    await pintar(
      'q=grifo&page=3',
      Promise.resolve(resultado([GRIFO], { totalPages: 3 })),
    );
    await screen.findByText(GRIFO.title);

    await userEvent.selectOptions(
      screen.getByLabelText(es.filtros.ciudad),
      'Sevilla',
    );
    await pulsar(es.filtros.aplicar);

    // Sin radio: sin un punto, no filtraba nada.
    expect(reemplazar).toHaveBeenLastCalledWith(
      '/services/search?q=grifo&city=Sevilla',
    );
  });

  it('buscar un texto nuevo conserva los filtros que había', async () => {
    // Solo se escribía el texto: con «?q=grifo&city=Sevilla», buscar
    // «enchufe» llevaba a «?q=enchufe» y la ciudad se perdía.
    await pintar('q=grifo&city=Sevilla');
    await screen.findByText(GRIFO.title);

    const texto = screen.getByRole('searchbox', {
      name: es.buscador.buscarServicios,
    });
    await userEvent.clear(texto);
    await userEvent.type(texto, 'enchufe{Enter}');

    expect(reemplazar).toHaveBeenLastCalledWith(
      '/services/search?q=enchufe&city=Sevilla',
    );
  });

  it('la misma búsqueda en otro orden no navega: se vuelve a pedir', async () => {
    buscar.mockResolvedValue(respuestaApi([LUZ]));
    await pintar('city=Sevilla&q=grifo');
    await screen.findByText(GRIFO.title);

    await pulsar(es.filtros.aplicar);

    expect(reemplazar).not.toHaveBeenCalled();
    expect(await screen.findByText(LUZ.title)).toBeInTheDocument();
    expect(buscar).toHaveBeenCalledWith({
      query: 'grifo',
      city: 'Sevilla',
      page: 1,
    });
  });

  it('repetir la búsqueda desde la página 3 vuelve a la primera', async () => {
    await pintar(
      'q=grifo&page=3',
      Promise.resolve(resultado([GRIFO], { totalPages: 3 })),
    );
    await screen.findByText(GRIFO.title);

    await pulsar(es.comun.buscar);

    expect(reemplazar).toHaveBeenLastCalledWith('/services/search?q=grifo');
  });

  it('una respuesta que llega tarde, de una búsqueda repetida, no pisa la vigente', async () => {
    // Ganaba la que respondía la última, no la que se pidió la última.
    const primera = aplazada<unknown>();
    const segunda = aplazada<unknown>();
    buscar
      .mockReturnValueOnce(primera.promesa)
      .mockReturnValueOnce(segunda.promesa);
    await pintar('', Promise.resolve(null));
    await act(async () => {});

    await pulsar(es.comun.buscar);
    await act(async () => {
      segunda.responder(respuestaApi([LUZ]));
    });
    await act(async () => {
      primera.responder(respuestaApi([GRIFO]));
    });

    expect(screen.getByText(LUZ.title)).toBeInTheDocument();
    expect(screen.queryByText(GRIFO.title)).toBeNull();
  });

  it('en móvil los filtros se despliegan tras un botón que dice si están abiertos', async () => {
    await pintar();
    await screen.findByText(GRIFO.title);
    const desplegar = screen.getByRole('button', {
      name: es.resultados.filtros,
    });
    expect(desplegar).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(desplegar);

    expect(desplegar).toHaveAttribute('aria-expanded', 'true');
    expect(desplegar).toHaveAttribute('aria-controls', 'panel-filtros');
  });

  it('un texto nuevo va a la URL, que es la que manda', async () => {
    await pintar();
    await screen.findByText(GRIFO.title);

    await userEvent.type(
      screen.getByRole('searchbox', { name: es.buscador.buscarServicios }),
      'enchufe',
    );
    await pulsar(es.comun.buscar);

    expect(reemplazar).toHaveBeenCalledWith('/services/search?q=enchufe');
    // La búsqueda la lanza la dirección nueva, no esta pantalla.
    expect(buscar).not.toHaveBeenCalled();
  });
});
