import { ColumnNumericTransformer } from './column-numeric.transformer';

/**
 * PostgreSQL devuelve los `numeric` como cadena para no perder precisión.
 *
 * Sin este transformador, un precio de 45.50 llega como "45.50" y todo lo que
 * lo toque después concatena en vez de sumar: dos precios dan "45.5090.00" y
 * una comparación ordena "100" antes que "90".
 */
describe('ColumnNumericTransformer', () => {
  const transformador = new ColumnNumericTransformer();

  describe('al leer de la base', () => {
    it('convierte la cadena en número', () => {
      expect(transformador.from('45.50')).toBe(45.5);
      expect(transformador.from('0')).toBe(0);
      expect(transformador.from('-12.75')).toBe(-12.75);
    });

    it('distingue el cero de la ausencia de valor', () => {
      // Un precio de cero es un precio; que se confundiera con «sin precio»
      // sería peor que el problema que este transformador resuelve.
      expect(transformador.from('0')).toBe(0);
      expect(transformador.from(null)).toBeNull();
      expect(transformador.from(undefined as unknown as string)).toBeNull();
    });

    it('devuelve nulo ante algo que no es un número, en vez de NaN', () => {
      // NaN se propaga en silencio por cualquier cálculo y acaba pintándose
      // en pantalla; un nulo se ve venir.
      expect(transformador.from('no es un número')).toBeNull();
      expect(transformador.from('')).toBe(0);
    });
  });

  describe('al escribir', () => {
    it('deja el valor como está', () => {
      expect(transformador.to(45.5)).toBe(45.5);
      expect(transformador.to(null)).toBeNull();
    });
  });
});
