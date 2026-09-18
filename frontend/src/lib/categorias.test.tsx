import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';
import de from '../../messages/de.json';
import { useNombreCategoria } from './categorias';

function nombrar(
  categoria: { slug?: string; name: string },
  mensajes: unknown = es,
  locale = 'es',
) {
  const { result } = renderHook(() => useNombreCategoria(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale={locale} messages={mensajes as never}>
        {children}
      </NextIntlClientProvider>
    ),
  });
  return result.current(categoria);
}

describe('useNombreCategoria', () => {
  it('traduce las del catálogo', () => {
    const fontaneria = { slug: 'fontaneria', name: 'Fontanería' };

    expect(nombrar(fontaneria)).toBe('Fontanería');
    expect(nombrar(fontaneria, de, 'de')).toBe('Sanitärinstallation');
  });

  it('enseña el nombre original si no está traducida', () => {
    // Un administrador puede crear una categoría nueva en cualquier momento.
    // Mostrar la clave en crudo sería peor que mostrarla en castellano.
    const nueva = { slug: 'peluqueria-canina', name: 'Peluquería canina' };

    expect(nombrar(nueva, de, 'de')).toBe('Peluquería canina');
  });

  it('también si no trae slug', () => {
    expect(nombrar({ name: 'Sin slug' }, de, 'de')).toBe('Sin slug');
  });

  it('la base manda sobre qué existe, el catálogo sobre cómo se escribe', () => {
    // El nombre guardado no se usa cuando hay traducción: si alguien renombra
    // la fila en la base, la interfaz sigue mostrando su término traducido.
    const renombrada = { slug: 'fontaneria', name: 'Lo que sea' };

    expect(nombrar(renombrada, de, 'de')).toBe('Sanitärinstallation');
  });
});
