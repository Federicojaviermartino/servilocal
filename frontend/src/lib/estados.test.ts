import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';
import { BookingStatus } from '@/types';
import { CLAVE_ESTADO, VARIANTE_ESTADO } from './estados';

describe('estados de reserva', () => {
  const estados = Object.values(BookingStatus);

  it('cubre todos los estados, sin dejarse ninguno', () => {
    // Añadir un estado al enumerado y olvidarse de estas tablas deja la
    // pantalla mostrando la clave en crudo, o un distintivo sin color.
    for (const estado of estados) {
      expect(CLAVE_ESTADO[estado]).toBeDefined();
      expect(VARIANTE_ESTADO[estado]).toBeDefined();
    }
  });

  it('cada clave existe en el catálogo de traducciones', () => {
    // Es lo que separa «Pendiente» de un literal «pendiente» en pantalla.
    const catalogo = (es as Record<string, Record<string, string>>).estados;

    for (const estado of estados) {
      expect(catalogo[CLAVE_ESTADO[estado]]).toBeDefined();
    }
  });

  it('no repite clave entre dos estados distintos', () => {
    const claves = estados.map((e) => CLAVE_ESTADO[e]);

    expect(new Set(claves).size).toBe(claves.length);
  });

  it('el color acompaña al significado', () => {
    // Una reserva completada en rojo o una rechazada en verde se leen al
    // revés de lo que son, y el color se mira antes que el texto.
    expect(VARIANTE_ESTADO[BookingStatus.COMPLETED]).toBe('success');
    expect(VARIANTE_ESTADO[BookingStatus.REJECTED]).toBe('danger');
    expect(VARIANTE_ESTADO[BookingStatus.PENDING]).toBe('warning');
  });
});
