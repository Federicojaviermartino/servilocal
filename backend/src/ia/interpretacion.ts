import {
  ampliarBusqueda,
  escaparRegExp,
  normalizar,
} from '../services/sinonimos';

/**
 * Cómo se convierte un mensaje en filtros de búsqueda, sin nada más.
 *
 * Vive aparte del servicio para que lo mismo que corre en producción se
 * pueda evaluar fuera de ella: el conjunto de evaluación de evaluacion/ usa
 * estas funciones tal cual, con el modelo y sin él.
 */

/** Lo único que el modelo puede decidir. */
export interface Intencion {
  categoriaSlug: string | null;
  ciudad: string | null;
  palabrasClave: string[];
}

/** Lo que el modelo puede elegir: categorías y ciudades con oferta. */
export interface Catalogo {
  categorias: { slug: string; nombre: string }[];
  ciudades: string[];
}

/**
 * Interpretación sin modelo: diccionario de oficios y lista de ciudades.
 *
 * Es el camino que se recorre sin clave, sin presupuesto o cuando el modelo
 * falla, y devuelve servicios reales igualmente. Por eso no hay modo
 * simulado: el usuario pierde la redacción y el multiidioma, no el servicio.
 */
export function interpretarSinModelo(
  mensaje: string,
  catalogo: {
    categorias: { slug: string; nombre: string }[];
    ciudades: string[];
  },
): Intencion {
  const texto = normalizar(mensaje);

  const ciudad =
    catalogo.ciudades.find((c) => {
      const n = escaparRegExp(normalizar(c));
      return new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`).test(texto);
    }) ?? null;

  // ampliarBusqueda ya traduce oficio o síntoma al nombre de la categoría.
  // ampliarBusqueda devuelve el nombre de la categoría con espacios
  // («clases particulares») y el slug lleva guiones
  // («clases-particulares»): hay que comparar con ambos aplanados.
  const aplanar = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, '');
  const ampliado = ampliarBusqueda(mensaje).map(aplanar);

  // ampliarBusqueda omite a propósito el término que ya aparece en el
  // texto, porque repetirlo solo añadiría ramas OR idénticas. Eso está
  // bien para la consulta pero dejaría sin categoría a quien escribe
  // «limpieza a fondo», así que se comprueba también la coincidencia
  // directa con el nombre o el slug.
  const plano = aplanar(mensaje);
  const categoriaSlug =
    catalogo.categorias.find(
      (c) =>
        ampliado.includes(aplanar(c.slug)) ||
        plano.includes(aplanar(c.slug)) ||
        plano.includes(aplanar(c.nombre)),
    )?.slug ?? null;

  return { categoriaSlug, ciudad, palabrasClave: [] };
}

/** Descarta del modelo todo lo que no esté en el catálogo. */
export function validarIntencion(
  crudo: unknown,
  catalogo: { categorias: { slug: string }[]; ciudades: string[] },
): Intencion {
  const o = (crudo ?? {}) as Record<string, unknown>;

  const slug = typeof o.categoriaSlug === 'string' ? o.categoriaSlug : null;
  const ciudad = typeof o.ciudad === 'string' ? o.ciudad : null;

  const palabras = Array.isArray(o.palabrasClave)
    ? o.palabrasClave
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.slice(0, 20))
        .slice(0, 4)
    : [];

  return {
    // Una categoría que no existe no se corrige ni se aproxima: se descarta.
    // Aproximarla sería dejar que el modelo dirija la búsqueda por la puerta
    // de atrás.
    categoriaSlug:
      slug && catalogo.categorias.some((c) => c.slug === slug) ? slug : null,
    ciudad:
      ciudad &&
      catalogo.ciudades.some((c) => normalizar(c) === normalizar(ciudad))
        ? catalogo.ciudades.find((c) => normalizar(c) === normalizar(ciudad))!
        : null,
    palabrasClave: palabras,
  };
}

/** Instrucciones del modelo: el catálogo cerrado sobre el que puede elegir. */
export function promptDeSistema(catalogo: {
  categorias: { slug: string; nombre: string }[];
  ciudades: string[];
}): string {
  return [
    'Interpretas lo que alguien necesita para su casa y lo traduces a filtros de búsqueda.',
    'Respondes SOLO con un objeto JSON, sin texto alrededor y sin vallas de código.',
    '',
    'Formato exacto:',
    '{"categoriaSlug": <slug o null>, "ciudad": <ciudad o null>, "palabrasClave": [<hasta 4 palabras>]}',
    '',
    'categoriaSlug solo puede ser uno de estos valores exactos:',
    catalogo.categorias.map((c) => `  ${c.slug} (${c.nombre})`).join('\n'),
    '',
    'ciudad solo puede ser uno de estos valores exactos:',
    catalogo.ciudades.map((c) => `  ${c}`).join('\n'),
    '',
    'Si no estás seguro de la categoría o de la ciudad, pon null. No inventes.',
    'El mensaje puede venir en cualquier idioma; los valores que devuelves son siempre los de estas listas.',
    'palabrasClave son términos de búsqueda en castellano, sin la ciudad ni la categoría.',
  ].join('\n');
}

/** El JSON puede venir con explicación alrededor pese a pedirlo limpio. */
export function extraerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    const inicio = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    if (inicio === -1 || fin <= inicio) return null;
    try {
      return JSON.parse(texto.slice(inicio, fin + 1));
    } catch {
      return null;
    }
  }
}
