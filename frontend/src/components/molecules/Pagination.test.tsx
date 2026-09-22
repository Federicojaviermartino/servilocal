import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import Pagination from './Pagination';

function pintar(page: number, totalPages: number, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <Pagination page={page} totalPages={totalPages} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

/** Los números que salen pintados, en orden. */
const numeros = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.textContent?.trim())
    .filter((t) => t && /^\d+$/.test(t));

describe('Pagination', () => {
  it('con una sola página no se pinta nada', () => {
    // Una paginación de una página es ruido: ocupa sitio y no lleva a
    // ninguna parte.
    pintar(1, 1);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('con pocas páginas salen todas', () => {
    pintar(3, 7);

    expect(numeros()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('con muchas, el centro se recorta y se conservan los extremos', () => {
    // Veinte botones no caben en una línea de móvil, y la primera y la
    // última página son las que más se pulsan.
    pintar(10, 20);

    const vistos = numeros();
    expect(vistos[0]).toBe('1');
    expect(vistos[vistos.length - 1]).toBe('20');
    expect(vistos).toContain('10');
    expect(vistos.length).toBeLessThan(10);
  });

  it('al principio no se recorta por la izquierda', () => {
    pintar(2, 20);

    expect(numeros().slice(0, 4)).toEqual(['1', '2', '3', '4']);
  });

  it('al final no se recorta por la derecha', () => {
    pintar(19, 20);

    expect(numeros().slice(-4)).toEqual(['17', '18', '19', '20']);
  });

  it('la página actual se anuncia como tal', () => {
    // Sin aria-current, quien navega por teclado no sabe dónde está.
    pintar(3, 10);

    expect(screen.getByRole('button', { current: 'page' })).toHaveTextContent(
      '3',
    );
  });

  it('en la primera página no se puede retroceder', () => {
    pintar(1, 10);

    expect(
      screen.getByRole('button', { name: es.paginacion.anterior }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: es.paginacion.siguiente }),
    ).toBeEnabled();
  });

  it('en la última no se puede avanzar', () => {
    pintar(10, 10);

    expect(
      screen.getByRole('button', { name: es.paginacion.siguiente }),
    ).toBeDisabled();
  });

  it('pulsar un número pide esa página', async () => {
    const onChange = pintar(1, 10);

    await userEvent.click(screen.getByRole('button', { name: /Página 3/ }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('las flechas se mueven de una en una', async () => {
    const onChange = pintar(5, 10);

    await userEvent.click(
      screen.getByRole('button', { name: es.paginacion.siguiente }),
    );
    expect(onChange).toHaveBeenCalledWith(6);

    await userEvent.click(
      screen.getByRole('button', { name: es.paginacion.anterior }),
    );
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
