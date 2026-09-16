import { ampliarBusqueda, normalizar } from './sinonimos';

describe('sinonimos', () => {
  describe('normalizar', () => {
    it('quita acentos y mayúsculas, como hace la consulta', () => {
      expect(normalizar('Fontanería')).toBe('fontaneria');
      expect(normalizar('MÁLAGA')).toBe('malaga');
      expect(normalizar('Climatización')).toBe('climatizacion');
    });
  });

  describe('ampliarBusqueda', () => {
    it('lleva el nombre del oficio a su categoría', () => {
      // Este es el caso que motivó el diccionario: «fontanero» devolvía cero
      // resultados mientras «fontanería» devolvía cinco.
      expect(ampliarBusqueda('fontanero')).toContain('fontaneria');
      expect(ampliarBusqueda('electricista')).toContain('electricidad');
      expect(ampliarBusqueda('cerrajero')).toContain('cerrajeria');
    });

    it('entiende el síntoma, que es como lo cuenta quien tiene la avería', () => {
      expect(ampliarBusqueda('se me ha roto el grifo')).toContain('fontaneria');
      expect(ampliarBusqueda('me he quedado fuera de casa')).toContain(
        'cerrajeria',
      );
      expect(ampliarBusqueda('no me funciona el enchufe')).toContain(
        'electricidad',
      );
    });

    it('funciona con acentos y mayúsculas', () => {
      expect(ampliarBusqueda('INSTALACIÓN ELÉCTRICA')).toContain(
        'electricidad',
      );
    });

    it('no amplía si ya se buscaba por el término de destino', () => {
      // Repetirlo solo añadiría ramas OR idénticas a la consulta.
      expect(ampliarBusqueda('fontaneria')).toEqual([]);
      expect(ampliarBusqueda('Fontanería')).toEqual([]);
    });

    it('exige palabra completa y no coincidencia dentro de otra', () => {
      // Sin límites de palabra, «luz» se dispararía dentro de «andaluza» y
      // «obra» dentro de «sobrado», ampliando búsquedas que no lo piden.
      expect(ampliarBusqueda('cocina andaluza')).toEqual([]);
      expect(ampliarBusqueda('he sobrado material')).toEqual([]);
    });

    it('devuelve vacío cuando no reconoce nada', () => {
      expect(ampliarBusqueda('ornitorrinco')).toEqual([]);
      expect(ampliarBusqueda('')).toEqual([]);
      expect(ampliarBusqueda('   ')).toEqual([]);
    });

    it('nunca amplía más de tres términos', () => {
      // Cada término son tres ramas OR más; sin freno, una frase larga
      // acabaría devolviendo el catálogo entero.
      const frase =
        'necesito fontanero electricista cerrajero pintor carpintero jardinero';
      expect(ampliarBusqueda(frase).length).toBeLessThanOrEqual(3);
    });

    it('no se rompe con caracteres que significan algo en una expresión regular', () => {
      expect(() => ampliarBusqueda('grifo (roto) [urgente] +')).not.toThrow();
      expect(ampliarBusqueda('grifo (roto)')).toContain('fontaneria');
    });
  });
});
