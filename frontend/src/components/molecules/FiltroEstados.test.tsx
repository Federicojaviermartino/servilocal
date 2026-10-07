import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import { BookingStatus } from '@/types';
import FiltroEstados, { type FiltroDeEstado } from './FiltroEstados';

const RESERVAS = [
  { status: BookingStatus.PENDING },
  { status: BookingStatus.PENDING },
  { status: BookingStatus.CONFIRMED },
  { status: BookingStatus.CANCELLED },
];

function pintar(valor: FiltroDeEstado = 'all') {
  const alCambiar = vi.fn();
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <FiltroEstados valor={valor} onCambiar={alCambiar} reservas={RESERVAS} />
    </NextIntlClientProvider>,
  );
  const grupo = screen.getByRole('group', { name: es.estados.filtrar });
  const boton = (nombre: string) =>
    within(grupo).getByRole('button', { name: new RegExp(`^${nombre}`) });
  return { alCambiar, grupo, boton };
}

describe('FiltroEstados', () => {
  it('el que está puesto lo dice, no solo lo pinta', () => {
    // Se distinguía por el color y nada más: ni un lector de pantalla ni
    // quien no distingue ese azul sabían qué lista estaban viendo.
    const { grupo, boton } = pintar(BookingStatus.PENDING);

    expect(boton(es.estados.pendientes)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const pulsados = within(grupo)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pulsados).toHaveLength(1);
  });

  it('cada uno lleva cuántas reservas tiene', () => {
    const { boton } = pintar();

    expect(boton(es.estados.todas)).toHaveTextContent('4');
    expect(boton(es.estados.pendientes)).toHaveTextContent('2');
    expect(boton(es.estados.confirmadas)).toHaveTextContent('1');
    expect(boton(es.estados.completadas)).toHaveTextContent('0');
  });

  it('las canceladas y las rechazadas tienen el suyo', () => {
    // Faltaban: solo se llegaba a ellas buscándolas entre todas.
    const { boton } = pintar();

    expect(boton(es.estados.canceladas)).toHaveTextContent('1');
    expect(boton(es.estados.rechazadas)).toHaveTextContent('0');
  });

  it('pulsar uno pide ese estado', async () => {
    const { alCambiar, boton } = pintar();

    await userEvent.click(boton(es.estados.confirmadas));
    await userEvent.click(boton(es.estados.todas));

    expect(alCambiar.mock.calls).toEqual([[BookingStatus.CONFIRMED], ['all']]);
  });
});
