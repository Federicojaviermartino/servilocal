import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import type { Service } from '@/types';
import SearchPage from './page';

const buscar = vi.fn();
const reemplazar = vi.fn();
const desplazar = vi.fn((): ScrollBehavior => 'smooth');
const desplazarVentana = vi.fn();
let parametros = new URLSearchParams();

vi.mock('@/lib/api', () => ({
  servicesApi: { search: (filtros: unknown) => buscar(filtros) },
  // El panel de filtros pide las categorías al montarse; aquí no cuentan.
  categoriesApi: { getAll: async () => ({ data: [] }) },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => parametros,
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
    useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
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

/** La respuesta paginada de la API, como la envuelve axios. */
const pagina = (servicios: Service[], meta: object = {}) => ({
  data: {
    data: servicios,
    meta: { total: servicios.length, totalPages: 1, ...meta },
  },
});

/** Una respuesta que llega cuando la prueba quiere. */
function aplazada() {
  let responder!: (valor: unknown) => void;
  const promesa = new Promise((resolver) => {
    responder = resolver;
  });
  return { promesa, responder };
}

const arbol = () => (
  <NextIntlClientProvider locale="es" messages={es as never}>
    <SearchPage />
  </NextIntlClientProvider>
);

let pintado: ReturnType<typeof render>;
const pintar = () => {
  pintado = render(arbol());
  return pintado;
};

/**
 * Lo que haría el enrutador tras un replace: la dirección cambia y la página
 * se vuelve a pintar con ella.
 */
const navegarA = async (url: string) => {
  parametros = new URLSearchParams(url.split('?')[1] ?? '');
  await act(async () => {
    pintado.rerender(arbol());
  });
};

const pulsar = (nombre: string) =>
  userEvent.click(screen.getByRole('button', { name: nombre }));

const irAPagina = (numero: number) =>
  pulsar(es.paginacion.pagina.replace('{numero}', String(numero)));

const navegacion = () =>
  screen.queryByRole('navigation', { name: es.paginacion.navegacion });

beforeEach(() => {
  buscar.mockReset();
  reemplazar.mockReset();
  desplazar.mockClear();
  desplazarVentana.mockReset();
  parametros = new URLSearchParams();
  // jsdom no se desplaza: solo se comprueba que se pide.
  window.scrollTo = desplazarVentana as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('El buscador', () => {
  it('busca con lo que trae la URL, y el buscador y los filtros lo reflejan', async () => {
    // Un enlace compartido o una recarga tienen que dar la misma búsqueda.
    parametros = new URLSearchParams({
      q: 'grifo',
      category: 'c1',
      city: 'Sevilla',
    });
    buscar.mockResolvedValue(pagina([GRIFO]));

    pintar();

    expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
    expect(buscar).toHaveBeenCalledWith({
      query: 'grifo',
      categoryId: 'c1',
      city: 'Sevilla',
      page: 1,
    });
    expect(
      screen.getByRole('searchbox', { name: es.buscador.buscarServicios }),
    ).toHaveValue('grifo');
    expect(screen.getByLabelText(es.filtros.ciudad)).toHaveValue('Sevilla');
  });

  it('sin nada en la URL, pide la primera página sin filtros', async () => {
    buscar.mockResolvedValue(pagina([GRIFO]));

    pintar();

    await screen.findByText(GRIFO.title);
    expect(buscar).toHaveBeenCalledWith({ page: 1 });
  });

  it('pinta los resultados y cuántos hay en total, no solo en la página', async () => {
    buscar.mockResolvedValue(
      pagina([GRIFO, LUZ], { total: 25, totalPages: 3 }),
    );

    pintar();

    expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
    expect(screen.getByText(LUZ.title)).toBeInTheDocument();
    expect(screen.getByText('25 resultados encontrados')).toBeInTheDocument();
    expect(navegacion()).toBeInTheDocument();
  });

  it('si el servidor dejó de contar, no da el total por exacto', async () => {
    buscar.mockResolvedValue(
      pagina([GRIFO], { total: 1000, totalPages: 84, totalEsParcial: true }),
    );

    pintar();

    expect(
      await screen.findByText('Más de 1000 resultados encontrados'),
    ).toBeInTheDocument();
  });

  it.each([
    ['una lista sin paginar', [GRIFO, LUZ], '2 resultados encontrados'],
    [
      'un total fuera de meta',
      { data: [GRIFO], total: 7 },
      '7 resultados encontrados',
    ],
    ['solo la lista, sin total', { data: [GRIFO] }, '1 resultado encontrado'],
  ])('entiende %s como respuesta', async (_forma, respuesta, cuenta) => {
    buscar.mockResolvedValue({ data: respuesta });

    pintar();

    expect(await screen.findByText(cuenta)).toBeInTheDocument();
    // Sin meta no hay más páginas que ofrecer.
    expect(navegacion()).toBeNull();
  });

  it('sin resultados lo dice, y un vacío sin lista cuenta como tal', async () => {
    buscar.mockResolvedValue({ data: {} });

    pintar();

    expect(
      await screen.findByText(es.resultados.sinResultados),
    ).toBeInTheDocument();
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
        .mockResolvedValueOnce(pagina([GRIFO]));

      pintar();

      expect(await screen.findByRole('alert')).toHaveTextContent(texto);
      expect(screen.queryByText(es.resultados.sinResultados)).toBeNull();
      expect(navegacion()).toBeNull();

      await pulsar(es.comun.reintentar);

      expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
      expect(buscar).toHaveBeenCalledTimes(2);
      expect(buscar).toHaveBeenLastCalledWith({ page: 1 });
    });
  });

  it('mientras carga lo anuncia, y si tarda explica que el servidor está despertando', async () => {
    // La instancia gratuita tarda en arrancar tras un rato sin uso. Mejor
    // decirlo que dejar a nadie mirando un indicador mudo.
    vi.useFakeTimers();
    const respuesta = aplazada();
    buscar.mockReturnValue(respuesta.promesa);

    pintar();

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
      respuesta.responder(pagina([GRIFO]));
    });
    expect(screen.getByText(GRIFO.title)).toBeInTheDocument();
    expect(screen.queryByText(es.resultados.despertando)).toBeNull();
  });

  describe('la paginación', () => {
    it('pide la página elegida, sube al principio y lleva el foco al título', async () => {
      // Con teclado o lector de pantalla, el foco se quedaba en el botón del
      // pie y nada decía que la lista había cambiado.
      buscar.mockResolvedValue(pagina([GRIFO], { total: 30, totalPages: 3 }));
      pintar();
      await screen.findByText(GRIFO.title);

      await irAPagina(2);

      expect(buscar).toHaveBeenLastCalledWith({ page: 2 });
      expect(desplazar).toHaveBeenCalled();
      expect(desplazarVentana).toHaveBeenCalledWith({
        top: 0,
        behavior: 'smooth',
      });
      expect(
        screen.getByRole('heading', { level: 1, name: es.resultados.titulo }),
      ).toHaveFocus();
      expect(
        await screen.findByRole('button', {
          name: es.paginacion.pagina.replace('{numero}', '2'),
        }),
      ).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('lista o mapa', () => {
    const lista = () =>
      screen.getByRole('button', { name: es.resultados.vistaLista });
    const mapa = () =>
      screen.getByRole('button', { name: es.resultados.vistaMapa });

    it('la vista activa se anuncia, no solo con el color', async () => {
      buscar.mockResolvedValue(pagina([GRIFO]));
      pintar();
      await screen.findByText(GRIFO.title);

      expect(lista()).toHaveAttribute('aria-pressed', 'true');
      expect(mapa()).toHaveAttribute('aria-pressed', 'false');

      await userEvent.click(mapa());
      // La vista va en la dirección: un enlace abre la misma que se veía.
      expect(reemplazar).toHaveBeenLastCalledWith('/services/search?view=map');
      await navegarA('/services/search?view=map');

      expect(lista()).toHaveAttribute('aria-pressed', 'false');
      expect(mapa()).toHaveAttribute('aria-pressed', 'true');
    });

    it('el mapa pide todo lo que admite la API, desde la primera página y sin paginar', async () => {
      // Quien abre un mapa espera ver todo lo del área, no doce resultados.
      buscar.mockResolvedValue(
        pagina([GRIFO, LUZ], { total: 30, totalPages: 3 }),
      );
      pintar();
      await screen.findByText(GRIFO.title);
      await irAPagina(3);
      await screen.findByText(GRIFO.title);

      await userEvent.click(mapa());
      await navegarA('/services/search?view=map');

      expect(buscar).toHaveBeenLastCalledWith({ page: 1, limit: 50 });
      expect(await screen.findByTestId('mapa')).toHaveTextContent(
        '2 en el mapa',
      );
      expect(screen.queryByText(GRIFO.title)).toBeNull();
      expect(navegacion()).toBeNull();
    });

    it('al volver a la lista, vuelve a paginar', async () => {
      parametros = new URLSearchParams({ view: 'map' });
      buscar.mockResolvedValue(pagina([GRIFO], { total: 30, totalPages: 3 }));
      pintar();
      await screen.findByTestId('mapa');

      await userEvent.click(lista());
      expect(reemplazar).toHaveBeenLastCalledWith('/services/search');
      await navegarA('/services/search');

      expect(buscar).toHaveBeenLastCalledWith({ page: 1 });
      expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
      expect(navegacion()).toBeInTheDocument();
    });

    it('pulsar la vista que ya está activa no vuelve a buscar', async () => {
      buscar.mockResolvedValue(pagina([GRIFO]));
      pintar();
      await screen.findByText(GRIFO.title);

      await userEvent.click(lista());

      expect(buscar).toHaveBeenCalledTimes(1);
    });

    it('una respuesta que llega tarde, de una consulta descartada, no pisa la vigente', async () => {
      // Ganaba la que respondía la última, no la que se pidió la última.
      const inicial = aplazada();
      const delMapa = aplazada();
      buscar
        .mockReturnValueOnce(inicial.promesa)
        .mockReturnValueOnce(delMapa.promesa);
      pintar();

      await userEvent.click(mapa());
      await navegarA('/services/search?view=map');
      await act(async () => {
        delMapa.responder(pagina([LUZ]));
      });
      await act(async () => {
        inicial.responder(pagina([GRIFO, LUZ]));
      });

      expect(screen.getByTestId('mapa')).toHaveTextContent('1 en el mapa');
    });
  });

  it('aplicar filtros los lleva a la URL, con el texto buscado, desde la primera página', async () => {
    // Los del panel no se escribían nunca en la dirección: se perdían al
    // recargar o al volver atrás, y un enlace no los llevaba.
    parametros = new URLSearchParams({ q: 'grifo' });
    buscar.mockResolvedValue(pagina([GRIFO], { total: 30, totalPages: 3 }));
    pintar();
    await screen.findByText(GRIFO.title);
    await irAPagina(3);
    await screen.findByText(GRIFO.title);

    await userEvent.selectOptions(
      screen.getByLabelText(es.filtros.ciudad),
      'Sevilla',
    );
    await pulsar(es.filtros.aplicar);

    expect(reemplazar).toHaveBeenLastCalledWith(
      '/services/search?q=grifo&city=Sevilla&radius=10',
    );
    await navegarA('/services/search?q=grifo&city=Sevilla&radius=10');
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: 'grifo',
        city: 'Sevilla',
        radiusKm: 10,
        page: 1,
      }),
    );
  });

  it('buscar un texto nuevo conserva los filtros que había', async () => {
    // Solo se escribía el texto: con «?q=grifo&city=Sevilla», buscar
    // «enchufe» llevaba a «?q=enchufe» y la ciudad se perdía.
    parametros = new URLSearchParams({ q: 'grifo', city: 'Sevilla' });
    buscar.mockResolvedValue(pagina([GRIFO]));
    pintar();
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

  it('dos direcciones con los mismos filtros en otro orden son la misma búsqueda', async () => {
    parametros = new URLSearchParams({
      radius: '10',
      city: 'Sevilla',
      q: 'grifo',
    });
    buscar.mockResolvedValue(pagina([GRIFO]));
    pintar();
    await screen.findByText(GRIFO.title);

    await pulsar(es.filtros.aplicar);

    // Mismos filtros: no se navega, se vuelve a pedir desde la primera.
    expect(reemplazar).not.toHaveBeenCalled();
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('en móvil los filtros se despliegan tras un botón que dice si están abiertos', async () => {
    buscar.mockResolvedValue(pagina([GRIFO]));
    pintar();
    await screen.findByText(GRIFO.title);
    const desplegar = screen.getByRole('button', {
      name: es.resultados.filtros,
    });
    expect(desplegar).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(desplegar);

    expect(desplegar).toHaveAttribute('aria-expanded', 'true');
    expect(desplegar).toHaveAttribute('aria-controls', 'panel-filtros');
  });

  describe('el buscador de texto', () => {
    const buscador = () =>
      screen.getByRole('searchbox', { name: es.buscador.buscarServicios });

    it('un texto nuevo va a la URL, que es la que manda', async () => {
      buscar.mockResolvedValue(pagina([GRIFO]));
      pintar();
      await screen.findByText(GRIFO.title);

      await userEvent.type(buscador(), 'enchufe');
      await pulsar(es.comun.buscar);

      expect(reemplazar).toHaveBeenCalledWith('/services/search?q=enchufe');
      // La búsqueda la lanza la URL nueva, no esta pantalla: pedirla aquí
      // también era hacerla dos veces.
      expect(buscar).toHaveBeenCalledTimes(1);
    });

    it('repetir el mismo texto lo vuelve a pedir desde la primera página', async () => {
      // La URL ya es esa: cambiarla no haría nada, así que se pide aquí.
      parametros = new URLSearchParams({ q: 'grifo' });
      buscar.mockResolvedValue(pagina([GRIFO], { total: 30, totalPages: 3 }));
      pintar();
      await screen.findByText(GRIFO.title);
      await irAPagina(2);
      await screen.findByText(GRIFO.title);

      await pulsar(es.comun.buscar);

      expect(reemplazar).not.toHaveBeenCalled();
      expect(buscar).toHaveBeenCalledTimes(3);
      expect(buscar).toHaveBeenLastCalledWith({ query: 'grifo', page: 1 });
      expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
    });

    it('vaciarlo sin nada en la URL busca sin texto, sin tocar la URL', async () => {
      buscar.mockResolvedValue(pagina([GRIFO]));
      pintar();
      await screen.findByText(GRIFO.title);

      await pulsar(es.comun.buscar);

      expect(reemplazar).not.toHaveBeenCalled();
      expect(buscar).toHaveBeenCalledTimes(2);
      expect(buscar).toHaveBeenLastCalledWith({ page: 1 });
    });
  });

  it('si cambia la URL, empieza de cero con lo que trae', async () => {
    // Un enlace, el botón de atrás o el asistente: la búsqueda anterior no
    // se arrastra, ni su página.
    buscar.mockResolvedValue(pagina([GRIFO], { total: 30, totalPages: 3 }));
    const { rerender } = pintar();
    await screen.findByText(GRIFO.title);
    await irAPagina(2);
    await screen.findByText(GRIFO.title);

    parametros = new URLSearchParams({ q: 'enchufe', city: 'Málaga' });
    rerender(
      <NextIntlClientProvider locale="es" messages={es as never}>
        <SearchPage />
      </NextIntlClientProvider>,
    );

    expect(buscar).toHaveBeenLastCalledWith({
      query: 'enchufe',
      city: 'Málaga',
      page: 1,
    });
    expect(await screen.findByText(GRIFO.title)).toBeInTheDocument();
    expect(buscar).toHaveBeenCalledTimes(3);
  });
});
