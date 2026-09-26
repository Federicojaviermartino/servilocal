import { describe, expect, it } from 'vitest';
import {
  DURACIONES,
  DURACION_POR_DEFECTO,
  formatearDuracion,
} from './duracion';

describe('formatearDuracion', () => {
  it.each([
    [30, 'es', '30 min'],
    [60, 'es', '1 h'],
    [90, 'es', '1,5 h'],
    [480, 'es', '8 h'],
    [90, 'en', '1.5 hr'],
  ])('%s minutos en %s: «%s»', (minutos, idioma, esperado) => {
    expect(formatearDuracion(minutos, idioma)).toBe(esperado);
  });

  it('cada idioma pone sus unidades, sin textos en los catálogos', () => {
    expect(formatearDuracion(60, 'de')).not.toBe(formatearDuracion(60, 'en'));
  });
});

describe('las duraciones que se ofrecen', () => {
  it('caben en los límites de la API: de 15 minutos a 8 horas', () => {
    for (const minutos of DURACIONES) {
      expect(minutos).toBeGreaterThanOrEqual(15);
      expect(minutos).toBeLessThanOrEqual(480);
    }
  });

  it('incluyen la que pone la base a un servicio que no dice nada', () => {
    expect(DURACIONES).toContain(DURACION_POR_DEFECTO);
  });
});
