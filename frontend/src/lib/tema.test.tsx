import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import es from '../../messages/es.json';
import SelectorTema from '@/components/molecules/SelectorTema';
import { useTemaOscuro } from './tema';

afterEach(() => document.documentElement.classList.remove('dark'));

describe('useTemaOscuro', () => {
  it('lee el tema de <html>, donde lo pone el script del layout', () => {
    document.documentElement.classList.add('dark');

    const { result } = renderHook(() => useTemaOscuro());

    expect(result.current).toBe(true);
  });

  it('se entera cuando cambia, sin volver a montar', async () => {
    const { result } = renderHook(() => useTemaOscuro());
    expect(result.current).toBe(false);

    await act(async () => {
      document.documentElement.classList.add('dark');
    });

    expect(result.current).toBe(true);
  });
});

describe('dos selectores de tema en la misma página', () => {
  it('cambiar uno cambia también el otro', async () => {
    // La cabecera tiene uno en escritorio y otro en el menú del móvil. Cada
    // uno copiaba el tema en su propio estado, y al pulsar uno el otro se
    // quedaba con el icono de antes.
    render(
      <NextIntlClientProvider locale="es" messages={es as never}>
        <SelectorTema />
        <SelectorTema />
      </NextIntlClientProvider>,
    );
    const [primero, segundo] = screen.getAllByRole('button');
    const etiquetaInicial = segundo.getAttribute('aria-label');

    await act(async () => {
      fireEvent.click(primero);
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(segundo.getAttribute('aria-label')).not.toBe(etiquetaInicial);
    expect(segundo.getAttribute('aria-label')).toBe(
      primero.getAttribute('aria-label'),
    );
  });
});
