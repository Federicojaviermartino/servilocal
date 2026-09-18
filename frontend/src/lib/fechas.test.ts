import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { localeDeFecha } from './fechas';

describe('localeDe', () => {
  it('empareja cada idioma de la aplicación con uno de date-fns', () => {
    // Un idioma sin pareja deja las fechas relativas en inglés dentro de una
    // interfaz que ya está traducida, y eso no lo detecta ningún tipo.
    for (const idioma of routing.locales) {
      expect(localeDeFecha(idioma)).toBeDefined();
    }
  });

  it('no devuelve el mismo catálogo para dos idiomas distintos', () => {
    const catalogos = routing.locales.map((i) => localeDeFecha(i));

    expect(new Set(catalogos).size).toBe(routing.locales.length);
  });

  it('cae en el castellano si llega un idioma que no existe', () => {
    expect(localeDeFecha('klingon' as never)).toBe(
      localeDeFecha(routing.defaultLocale),
    );
  });
});
