import { describe, expect, it } from 'vitest';
import { rutaInterna } from './ruta-interna';

describe('rutaInterna', () => {
  it.each(['/dashboard', '/services/abc/book', '/services/search?q=pintor'])(
    'deja pasar una página de aquí: %s',
    (ruta) => {
      expect(rutaInterna(ruta)).toBe(ruta);
    },
  );

  it.each([
    ['una dirección completa', 'https://servi1ocal.example/relogin'],
    ['una sin protocolo', '//servi1ocal.example'],
    ['una con la barra invertida', '/\\servi1ocal.example'],
    ['una con un tabulador en medio', '/\t/servi1ocal.example'],
    ['una ruta relativa', 'dashboard'],
    ['javascript:', 'javascript:alert(1)'],
  ])('manda a la portada %s', (_caso, ruta) => {
    // Un enlace así llevaba a quien acababa de entrar a una página ajena
    // que podía pedirle la contraseña otra vez.
    expect(rutaInterna(ruta)).toBe('/');
  });

  it('sin parámetro, a la portada', () => {
    expect(rutaInterna(null)).toBe('/');
    expect(rutaInterna('')).toBe('/');
  });
});
