import {
  ampliarBusqueda,
  escaparLike,
  escaparRegExp,
  normalizar,
} from './sinonimos';

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

describe('escaparRegExp', () => {
  /** Lo mismo que construye el asistente para buscar la ciudad en la frase. */
  const patronDe = (ciudad: string) =>
    new RegExp(`(^|[^a-z0-9])${escaparRegExp(ciudad)}([^a-z0-9]|$)`);

  it('una ciudad con un paréntesis sin cerrar ya no revienta', () => {
    // Las ciudades salen de un SELECT DISTINCT sobre los servicios, o sea de
    // lo que teclea cada profesional. Sin escapar, esto lanzaba un
    // SyntaxError y dejaba el asistente inservible para todo el mundo,
    // también en el modo básico que no usa IA.
    expect(() => patronDe('madrid (centro')).not.toThrow();
  });

  it.each([
    'sant cugat [valles]',
    'a coruna*',
    'l.hospitalet',
    'vitoria+gasteiz',
    'donostia|san sebastian',
    'que? ciudad',
  ])('tampoco con «%s»', (ciudad) => {
    expect(() => patronDe(ciudad)).not.toThrow();
  });

  it('y sigue encontrando la ciudad en la frase', () => {
    // Escapar no puede romper lo que ya funcionaba.
    expect(patronDe('malaga').test('busco fontanero en malaga urgente')).toBe(
      true,
    );
  });

  it('una ciudad con caracteres especiales se encuentra literalmente', () => {
    expect(patronDe('l.hospitalet').test('algo en l.hospitalet hoy')).toBe(
      true,
    );
    // Y el punto deja de valer como comodín: «lxhospitalet» no es la ciudad.
    expect(patronDe('l.hospitalet').test('algo en lxhospitalet hoy')).toBe(
      false,
    );
  });

  it('no encuentra una ciudad que solo aparece a medias', () => {
    expect(patronDe('leon').test('busco algo en leones')).toBe(false);
  });
});

describe('escaparLike', () => {
  const BARRA = String.fromCharCode(92);

  it('el guion bajo deja de ser comodín', () => {
    // Comprobado contra la base: buscar «repa_acion» encontraba
    // «reparación», porque en LIKE el guion bajo casa con cualquier carácter.
    expect(escaparLike('repa_acion')).toBe('repa' + BARRA + '_acion');
  });

  it('el porcentaje también', () => {
    // «50%» acababa como patrón «%50%%», que devuelve el catálogo entero.
    expect(escaparLike('50%')).toBe('50' + BARRA + '%');
  });

  it('y la propia barra, que si no escaparía al carácter siguiente', () => {
    expect(escaparLike(BARRA + '_')).toBe(BARRA + BARRA + BARRA + '_');
  });

  it('un texto normal no cambia', () => {
    // Escapar no puede estropear lo que ya funcionaba.
    expect(escaparLike('fontanero en málaga')).toBe('fontanero en málaga');
  });

  it('no toca los comodines que pone el propio buscador alrededor', () => {
    // El servicio envuelve el término en %...% después de escaparlo: esos
    // dos sí tienen que seguir siendo comodines.
    const patron = `%${escaparLike('50%')}%`;

    expect(patron.startsWith('%')).toBe(true);
    expect(patron.endsWith('%')).toBe(true);
    expect(patron).toBe('%50' + BARRA + '%%');
  });
});
