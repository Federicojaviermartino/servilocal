import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import type { Orden } from '@/lib/busqueda';
import OrdenResultados from './OrdenResultados';

const R = es.resultados;

function pintar(valor: Orden = 'newest', conCercania = false) {
  const alCambiar = vi.fn();
  const vigente = createRef<HTMLButtonElement>();
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <OrdenResultados
        valor={valor}
        conCercania={conCercania}
        onCambiar={alCambiar}
        refVigente={vigente}
      />
    </NextIntlClientProvider>,
  );
  const grupo = screen.getByRole('group', { name: R.ordenar });
  const botones = () =>
    within(grupo)
      .getAllByRole('button')
      .map((boton) => boton.textContent);
  const boton = (nombre: string) =>
    within(grupo).getByRole('button', { name: nombre });
  return { alCambiar, vigente, botones, boton };
}

describe('OrdenResultados', () => {
  it('es un grupo con su nombre, el mismo que se ve', () => {
    pintar();

    expect(screen.getByText(R.ordenar)).toBeVisible();
  });

  it('el que está puesto lo dice, no solo lo pinta', () => {
    const { boton } = pintar('rating');

    expect(boton(R.ordenValoracion)).toHaveAttribute('aria-pressed', 'true');
    expect(boton(R.ordenRecientes)).toHaveAttribute('aria-pressed', 'false');
    expect(boton(R.ordenPrecio)).toHaveAttribute('aria-pressed', 'false');
  });

  it('sin un punto desde el que medir, no se ofrece ordenar por cercanía', () => {
    const { botones } = pintar();

    expect(botones()).toEqual([
      R.ordenRecientes,
      R.ordenValoracion,
      R.ordenPrecio,
    ]);
  });

  it('con él, va la primera', () => {
    const { botones, boton } = pintar('distance', true);

    expect(botones()).toEqual([
      R.ordenCercania,
      R.ordenRecientes,
      R.ordenValoracion,
      R.ordenPrecio,
    ]);
    expect(boton(R.ordenCercania)).toHaveAttribute('aria-pressed', 'true');
  });

  it('pulsar uno pide ese orden', async () => {
    const { alCambiar, boton } = pintar();

    await userEvent.click(boton(R.ordenPrecio));
    await userEvent.click(boton(R.ordenValoracion));

    expect(alCambiar.mock.calls).toEqual([['price'], ['rating']]);
  });

  it('quien lo usa puede llegar al botón puesto, para devolverle el foco', () => {
    const { vigente, boton } = pintar('price');

    expect(vigente.current).toBe(boton(R.ordenPrecio));
  });
});
