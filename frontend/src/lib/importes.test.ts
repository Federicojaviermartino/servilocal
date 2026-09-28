import { describe, expect, it } from 'vitest';
import { formatearImporte, textoDelPrecio } from './importes';

// El formato de moneda separa con un espacio duro, que se ve igual que uno
// normal: se compara sin distinguirlos.
const plano = (texto: string) => texto.replace(/\s/g, ' ');

describe('formatearImporte', () => {
  it('escribe el importe como se escribe en cada idioma', () => {
    // Antes era «45.5 euros» en todos: punto decimal y sin el cero.
    expect(plano(formatearImporte(45.5, 'es'))).toBe('45,50 €');
    expect(plano(formatearImporte(45.5, 'en'))).toBe('€45.50');
    expect(plano(formatearImporte(1234.5, 'de'))).toBe('1.234,50 €');
  });

  it('sin céntimos si es entero, que en un precio solo son ruido', () => {
    expect(plano(formatearImporte(30, 'es'))).toBe('30 €');
  });

  it('con ellos si se piden, como en lo que se cobra', () => {
    expect(plano(formatearImporte(30, 'es', true))).toBe('30,00 €');
  });

  it('acepta el importe como texto, que es como llegan algunos decimales', () => {
    expect(plano(formatearImporte('19.99', 'es'))).toBe('19,99 €');
  });
});

describe('textoDelPrecio', () => {
  const t = (clave: string, valores: Record<string, string>) =>
    clave === 'precioRango'
      ? `${valores.min} a ${valores.max} ${valores.unidad}`
      : `${valores.min} ${valores.unidad}`;

  it('un precio solo, con la moneda: la tarjeta decía «30 por hora»', () => {
    expect(plano(textoDelPrecio({ priceMin: 30 }, t, 'es', 'por hora'))).toBe(
      '30 € por hora',
    );
  });

  it('un rango cuando hay un máximo distinto', () => {
    expect(
      plano(
        textoDelPrecio({ priceMin: 40, priceMax: 90 }, t, 'es', 'por hora'),
      ),
    ).toBe('40 € a 90 € por hora');
  });

  it('un máximo igual al mínimo no es un rango', () => {
    expect(
      plano(textoDelPrecio({ priceMin: 40, priceMax: '40' }, t, 'es', 'x')),
    ).toBe('40 € x');
  });
});
