import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import { CIUDADES } from '@/lib/ciudades';
import FilterPanel from './FilterPanel';
import type { ServiceSearchParams } from '@/types';

const getAll = vi.fn(async () => ({
  data: [
    { id: 'c1', name: 'Fontanería', slug: 'fontaneria' },
    { id: 'c2', name: 'Cerrajería', slug: 'cerrajeria' },
  ],
}));

vi.mock('@/lib/api', () => ({
  categoriesApi: { getAll: () => getAll() },
}));

function pintar(initial: ServiceSearchParams = {}) {
  const alAplicar = vi.fn();
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <FilterPanel initial={initial} onApply={alAplicar} />
    </NextIntlClientProvider>,
  );
  return alAplicar;
}

/** Lo que respondería el navegador al pedirle la ubicación. */
function ubicacion(respuesta: { latitude: number; longitude: number } | null) {
  const getCurrentPosition = vi.fn(
    (bien: PositionCallback, mal?: PositionErrorCallback | null) => {
      if (respuesta) bien({ coords: respuesta } as GeolocationPosition);
      else mal?.({ code: 1 } as GeolocationPositionError);
    },
  );
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}

describe('FilterPanel', () => {
  beforeEach(() => {
    getAll.mockClear();
  });

  afterEach(() => {
    // jsdom no tiene geolocalización: cada prueba pone la suya.
    Reflect.deleteProperty(navigator, 'geolocation');
  });

  it('las categorías llegan del servidor', async () => {
    pintar();

    expect(
      await screen.findByRole('option', { name: 'Fontanería' }),
    ).toBeInTheDocument();
  });

  it('si las categorías no cargan, el panel sigue usándose', async () => {
    // Un filtro menos es molesto; un panel en blanco deja la búsqueda sin
    // ciudad, sin radio y sin precio.
    getAll.mockRejectedValueOnce(new Error('sin red'));
    const alAplicar = pintar();

    await waitFor(() => expect(getAll).toHaveBeenCalled());
    await userEvent.click(
      screen.getByRole('button', { name: es.filtros.aplicar }),
    );

    expect(alAplicar).toHaveBeenCalled();
  });

  it('las ciudades son las de la lista con cobertura', () => {
    // Ofrecer una ciudad donde no se puede publicar daría siempre cero
    // resultados.
    pintar();

    for (const ciudad of CIUDADES) {
      expect(screen.getByRole('option', { name: ciudad })).toBeInTheDocument();
    }
  });

  it('arranca con los filtros que ya venían en la URL', () => {
    // Al recargar o compartir el enlace, el panel tiene que decir lo mismo
    // que los resultados.
    pintar({
      city: 'Sevilla',
      latitude: 37.39,
      longitude: -5.98,
      radiusKm: 25,
    });

    expect(screen.getByLabelText(es.filtros.ciudad)).toHaveValue('Sevilla');
    expect(
      screen.getByLabelText(es.filtros.radio.replace('{km}', '25')),
    ).toHaveValue('25');
  });

  it('aplicar entrega lo elegido', async () => {
    const alAplicar = pintar();

    await userEvent.selectOptions(
      screen.getByLabelText(es.filtros.ciudad),
      'Sevilla',
    );
    await userEvent.click(
      screen.getByRole('button', { name: es.filtros.aplicar }),
    );

    expect(alAplicar).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Sevilla' }),
    );
  });

  it('lo que se deja en blanco no viaja como cadena vacía', async () => {
    // El servidor filtraría por ciudad igual a «», y no habría resultados.
    const alAplicar = pintar();

    await userEvent.click(
      screen.getByRole('button', { name: es.filtros.aplicar }),
    );

    expect(alAplicar).toHaveBeenCalledWith(
      expect.objectContaining({ city: undefined, categoryId: undefined }),
    );
  });

  it('limpiar anula cada campo, no manda un objeto vacío', async () => {
    // El buscador fusiona lo que recibe sobre los filtros vigentes: un
    // objeto vacío no borraría nada y el botón no haría nada visible.
    const alAplicar = pintar({ city: 'Sevilla', minRating: 4 });

    await userEvent.click(
      screen.getByRole('button', { name: es.filtros.limpiar }),
    );

    expect(alAplicar).toHaveBeenCalledWith({
      categoryId: undefined,
      city: undefined,
      latitude: undefined,
      longitude: undefined,
      radiusKm: undefined,
      minRating: undefined,
      maxPrice: undefined,
    });
  });

  describe('cerca de ti', () => {
    it('sin ubicación no hay radio, ni viaja', async () => {
      // Se mandaba sin coordenadas y la API lo ignoraba: alguien en Valencia
      // ponía 5 km y recibía resultados de toda España.
      const alAplicar = pintar({ city: 'Sevilla', radiusKm: 25 });

      expect(screen.queryByRole('slider')).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.aplicar }),
      );

      expect(alAplicar).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: undefined, radiusKm: undefined }),
      );
    });

    it('con la ubicación aparece el radio, y viaja con el punto redondeado', async () => {
      // Dos decimales, algo más de un kilómetro: ni la dirección ni el
      // historial guardan dónde está la casa de quien busca.
      ubicacion({ latitude: 39.46975, longitude: -0.37739 });
      const alAplicar = pintar();

      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.usarUbicacion }),
      );
      expect(screen.getByText(es.filtros.cercaDeTi)).toBeInTheDocument();
      expect(
        screen.getByLabelText(es.filtros.radio.replace('{km}', '10')),
      ).toHaveValue('10');
      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.aplicar }),
      );

      expect(alAplicar).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 39.47,
          longitude: -0.38,
          radiusKm: 10,
        }),
      );
    });

    it('si el navegador no la da, lo explica y ofrece la ciudad', async () => {
      ubicacion(null);
      pintar();

      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.usarUbicacion }),
      );

      expect(screen.getByRole('alert')).toHaveTextContent(
        es.filtros.sinUbicacion,
      );
      expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    });

    it('un navegador sin geolocalización, también', async () => {
      pintar();

      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.usarUbicacion }),
      );

      expect(screen.getByRole('alert')).toHaveTextContent(
        es.filtros.sinUbicacion,
      );
    });

    it('quitar la ubicación quita también el radio', async () => {
      const alAplicar = pintar({
        latitude: 39.47,
        longitude: -0.38,
        radiusKm: 5,
      });

      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.quitarUbicacion }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.aplicar }),
      );

      expect(screen.queryByRole('slider')).not.toBeInTheDocument();
      expect(alAplicar).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: undefined,
          longitude: undefined,
          radiusKm: undefined,
        }),
      );
    });
  });

  describe('valoración mínima', () => {
    it('es un grupo con su nombre, y se elige una nota', async () => {
      // La etiqueta no estaba asociada al control.
      const alAplicar = pintar();

      expect(
        screen.getByRole('radiogroup', { name: es.filtros.valoracionMinima }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('radio', { name: '4 estrellas' }));
      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.aplicar }),
      );

      expect(alAplicar).toHaveBeenCalledWith(
        expect.objectContaining({ minRating: 4 }),
      );
    });

    it('«Cualquiera» la quita', async () => {
      const alAplicar = pintar({ minRating: 4 });

      await userEvent.click(
        screen.getByRole('radio', { name: es.filtros.valoracionCualquiera }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: es.filtros.aplicar }),
      );

      expect(alAplicar).toHaveBeenCalledWith(
        expect.objectContaining({ minRating: undefined }),
      );
    });
  });

  it('limpiar también deja el panel en blanco', async () => {
    const alAplicar = pintar({ city: 'Sevilla' });

    await userEvent.click(
      screen.getByRole('button', { name: es.filtros.limpiar }),
    );

    expect(screen.getByLabelText(es.filtros.ciudad)).toHaveValue('');
    expect(alAplicar).toHaveBeenCalled();
  });
});
