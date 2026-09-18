import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('FilterPanel', () => {
  beforeEach(() => {
    getAll.mockClear();
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
    pintar({ city: 'Sevilla', radiusKm: 25 });

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
      radiusKm: undefined,
      minRating: undefined,
      maxPrice: undefined,
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
