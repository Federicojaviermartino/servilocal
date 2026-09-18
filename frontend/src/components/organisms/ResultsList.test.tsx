import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import es from '../../../messages/es.json';
import { SERVICIO_EJEMPLO, otroServicio } from '../../../.storybook/datos';
import ResultsList from './ResultsList';
import type { Service } from '@/types';

const pintar = (servicios: Service[], total?: number) =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <ResultsList services={servicios} total={total} />
    </NextIntlClientProvider>,
  );

describe('ResultsList', () => {
  it('sin resultados lo dice y sugiere qué hacer', () => {
    // Una rejilla vacía sin texto se lee como una página rota. Aquí el vacío
    // solo puede significar cero resultados: si la búsqueda hubiera fallado,
    // este componente no llegaría a pintarse.
    pintar([]);

    expect(screen.getByText(es.resultados.sinResultados)).toBeInTheDocument();
    expect(
      screen.getByText(es.resultados.sinResultadosPista),
    ).toBeInTheDocument();
  });

  it('con resultados pinta una tarjeta por servicio', () => {
    pintar([
      SERVICIO_EJEMPLO as Service,
      otroServicio('segundo', {}) as Service,
      otroServicio('tercero', {}) as Service,
    ]);

    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('enseña cuántos hay cuando se le pasa el total', () => {
    // El total es el de la búsqueda entera, no el de la página: sin él,
    // quien ve doce resultados no sabe si hay trece o trescientos.
    pintar([SERVICIO_EJEMPLO as Service], 42);

    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('sin total no inventa una cuenta', () => {
    pintar([SERVICIO_EJEMPLO as Service]);

    expect(screen.queryByText(/resultado/i)).not.toBeInTheDocument();
  });
});
