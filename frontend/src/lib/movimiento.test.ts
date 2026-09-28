import { afterEach, describe, expect, it } from 'vitest';
import { desplazamiento } from './movimiento';

// jsdom no trae matchMedia: cada prueba pone el suyo.
const original = window.matchMedia;
const preferencia = (reducir: boolean) => {
  window.matchMedia = ((consulta: string) => ({
    matches: reducir && consulta.includes('reduce'),
  })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
  window.matchMedia = original;
});

describe('desplazamiento', () => {
  it('con animación, si no se ha pedido menos movimiento', () => {
    preferencia(false);

    expect(desplazamiento()).toBe('smooth');
  });

  it('sin ella, si se ha pedido', () => {
    // El CSS global no alcanza a un «smooth» pedido desde JavaScript.
    preferencia(true);

    expect(desplazamiento()).toBe('auto');
  });

  it('sin forma de saberlo, sin animación', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;

    expect(desplazamiento()).toBe('auto');
  });
});
