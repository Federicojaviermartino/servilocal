import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';
import de from '../../messages/de.json';
import { useNombreUnidad } from './unidades';
import { claveUnidad } from './unidad-clave';

function envoltorio(mensajes: Record<string, unknown>, locale: string) {
  function Envoltorio({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={mensajes as never}>
        {children}
      </NextIntlClientProvider>
    );
  }
  return Envoltorio;
}

function nombrar(unidad: string, mensajes = es, locale = 'es') {
  const { result } = renderHook(() => useNombreUnidad(), {
    wrapper: envoltorio(mensajes as never, locale),
  });
  return result.current(unidad);
}

describe('claveUnidad', () => {
  it('convierte el valor guardado en clave de catálogo', () => {
    expect(claveUnidad('por hora')).toBe('por-hora');
    expect(claveUnidad('por dia')).toBe('por-dia');
  });

  it('tolera espacios de más y mayúsculas', () => {
    expect(claveUnidad('  Por   Hora ')).toBe('por-hora');
  });
});

describe('useNombreUnidad', () => {
  it('traduce las unidades conocidas', () => {
    expect(nombrar('por hora')).toBe('por hora');
    expect(nombrar('por hora', de as never, 'de')).toBe('pro Stunde');
    expect(nombrar('por servicio', de as never, 'de')).toBe('pro Auftrag');
  });

  it('respeta el valor guardado sin tilde', () => {
    // En la base está «por dia» y así se queda, que es el contrato con la
    // API; lo que cambia es cómo se escribe en pantalla.
    expect(nombrar('por dia')).toBe('por día');
    expect(nombrar('por dia', de as never, 'de')).toBe('pro Tag');
  });

  it('enseña tal cual una unidad que no esté en el catálogo', () => {
    // Un profesional podría tener guardado algo antiguo. Mostrar la clave en
    // crudo sería peor que mostrarlo en castellano.
    expect(nombrar('por quincena')).toBe('por quincena');
  });

  it('no escribe nada si no hay unidad', () => {
    expect(nombrar('')).toBe('');
  });
});
