/**
 * Diccionario de oficios y síntomas.
 *
 * La búsqueda compara el texto contra el título, la descripción y el nombre de
 * la categoría, todo normalizado sin acentos. Eso hace que «fontanería»
 * encuentre sus cinco servicios pero «fontanero» no encuentre ninguno, porque
 * normalizar no acerca dos palabras distintas de la misma familia. Y quien
 * tiene una avería escribe el síntoma —«grifo que gotea»—, no el nombre del
 * gremio.
 *
 * Esto se resuelve antes de tocar el modelo: es una tabla, cuesta cero y
 * beneficia a quien nunca abra un chat. Lo que un diccionario no puede hacer
 * —entender una frase en alemán o preguntar para desambiguar— es lo que
 * justifica después la capa de IA, no esto.
 */

/** Términos que se añaden a la búsqueda cuando aparece alguno de los gatillos. */
interface Entrada {
  /** Palabras que escribe la gente. Se comparan ya normalizadas. */
  gatillos: string[];
  /** Términos con los que sí hay coincidencia en la base. */
  amplia: string[];
}

const ENTRADAS: Entrada[] = [
  {
    gatillos: [
      'fontanero',
      'fontaneros',
      'plomero',
      'grifo',
      'grifos',
      'goteo',
      'gotea',
      'fuga de agua',
      'fuga',
      'tuberia',
      'tuberias',
      'cisterna',
      'desatascar',
      'atasco',
      'desague',
      'sifon',
      'caldera',
      'calentador',
    ],
    amplia: ['fontaneria'],
  },
  {
    gatillos: [
      'electricista',
      'electricistas',
      'enchufe',
      'enchufes',
      'cortocircuito',
      'diferencial',
      'cuadro electrico',
      'luz',
      'bombilla',
      'instalacion electrica',
    ],
    amplia: ['electricidad'],
  },
  {
    gatillos: [
      'cerrajero',
      'cerrajeros',
      'cerradura',
      'cerraduras',
      'llave',
      'llaves',
      'bombin',
      'me he quedado fuera',
      'puerta blindada',
    ],
    amplia: ['cerrajeria'],
  },
  {
    gatillos: [
      'pintor',
      'pintores',
      'pintar',
      'gotele',
      'alisar paredes',
      'pared',
      'paredes',
    ],
    amplia: ['pintura'],
  },
  {
    gatillos: [
      'carpintero',
      'carpinteros',
      'mueble',
      'muebles',
      'armario',
      'puerta',
      'puertas',
      'tarima',
      'parquet',
    ],
    amplia: ['carpinteria'],
  },
  {
    gatillos: [
      'limpiadora',
      'limpiador',
      'limpieza a fondo',
      'limpiar',
      'asistenta',
      'plancha',
      'planchado',
    ],
    amplia: ['limpieza'],
  },
  {
    gatillos: [
      'jardinero',
      'jardineros',
      'cesped',
      'podar',
      'poda',
      'seto',
      'riego',
    ],
    amplia: ['jardineria'],
  },
  {
    gatillos: [
      'profesor',
      'profesora',
      'profe',
      'clases',
      'clase',
      'repaso',
      'matematicas',
      'ingles',
      'deberes',
      'selectividad',
    ],
    amplia: ['clases particulares'],
  },
  {
    gatillos: [
      'reforma',
      'reformas',
      'obra',
      'albanil',
      'alicatar',
      'bano nuevo',
      'cocina nueva',
    ],
    amplia: ['reformas'],
  },
  {
    gatillos: [
      'mudanza',
      'mudanzas',
      'porte',
      'portes',
      'transportista',
      'furgoneta',
      'trasteo',
    ],
    amplia: ['mudanzas'],
  },
  {
    gatillos: [
      'aire acondicionado',
      'climatizacion',
      'split',
      'calefaccion',
      'radiador',
      'radiadores',
      'bomba de calor',
    ],
    amplia: ['climatizacion'],
  },
  {
    gatillos: [
      'informatico',
      'ordenador',
      'portatil',
      'wifi',
      'router',
      'impresora',
      'virus',
    ],
    amplia: ['informatica'],
  },
];

/** Misma normalización que usa la consulta: minúsculas y sin acentos. */
/**
 * Escapa lo que va a acabar dentro de una expresión regular.
 *
 * Las ciudades del catálogo salen de un SELECT DISTINCT sobre los servicios,
 * o sea de lo que teclea cada profesional al publicar. Una con un paréntesis
 * sin cerrar —«Madrid (centro»— hacía que el constructor de la expresión
 * lanzara, y esa excepción tumbaba el asistente entero para todo el mundo,
 * también en el modo básico que funciona sin IA. Cualquiera con una cuenta de
 * profesional podía provocarlo publicando un servicio.
 */
export function escaparRegExp(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Devuelve los términos con los que además hay que buscar.
 *
 * No sustituye a lo que escribió la persona: se añade. Quien busca «fontanero»
 * debe seguir encontrando un servicio cuyo título lo diga literalmente, si
 * existe, además de los de la categoría.
 *
 * Nunca devuelve más de tres términos: cada uno es una rama OR más en la
 * consulta, y ampliar sin freno acaba devolviendo el catálogo entero.
 */
export function ampliarBusqueda(query: string): string[] {
  const texto = normalizar(query);
  if (!texto) return [];

  const encontrados = new Set<string>();

  for (const entrada of ENTRADAS) {
    const coincide = entrada.gatillos.some((gatillo) =>
      // Con límites de palabra, para que «luz» no se dispare dentro de
      // «andaluza» ni «obra» dentro de «sobrado».
      new RegExp(`(^|[^a-z0-9])${gatillo}([^a-z0-9]|$)`).test(texto),
    );
    if (coincide) {
      entrada.amplia.forEach((t) => encontrados.add(t));
    }
  }

  // Si ya buscaba por el término ampliado, no hace falta repetirlo.
  return [...encontrados].filter((t) => !texto.includes(t)).slice(0, 3);
}
