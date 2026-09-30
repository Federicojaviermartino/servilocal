import type { Metadata } from 'next';
import { routing, type Idioma } from '@/i18n/routing';
import { SITIO_URL } from '@/lib/sitio';
import imagenSocial from '@/assets/imagen-social.png';

/**
 * La imagen de un enlace compartido, para lo que no tiene una propia: solo
 * las fichas con foto llevaban. Se genera con scripts/imagen-social.mjs.
 */
export const IMAGEN_SOCIAL = {
  url: typeof imagenSocial === 'string' ? imagenSocial : imagenSocial.src,
  width: 1200,
  height: 630,
  alt: 'ServiLocal',
};

/**
 * Lo que enseña una red social al compartir una página.
 *
 * El openGraph de una página **sustituye** al del layout, como alternates:
 * las que solo ponían título y descripción se compartían con los de la
 * portada. Va entero, con su imagen, su dirección y su idioma.
 */
export function grafoAbierto(
  locale: string,
  {
    titulo,
    descripcion,
    ruta,
  }: { titulo: string; descripcion: string; ruta: string },
): NonNullable<Metadata['openGraph']> {
  return {
    type: 'website',
    siteName: 'ServiLocal',
    locale,
    title: titulo,
    description: descripcion,
    url: urlDe(locale, ruta),
    images: [IMAGEN_SOCIAL],
  };
}

/**
 * Dirección absoluta de una ruta en un idioma.
 *
 * El idioma por defecto no lleva prefijo, que es como está configurado el
 * enrutado: `/services/search` en castellano y `/de/services/search` en
 * alemán.
 */
export function urlDe(locale: string, ruta = ''): string {
  const prefijo = locale === routing.defaultLocale ? '' : `/${locale}`;
  return `${SITIO_URL}${prefijo}${ruta}`;
}

/**
 * Canónica y alternativas de idioma de una página.
 *
 * Vive aquí porque el `alternates` de un layout anidado **sustituye** al del
 * padre, no se funde con él. Cada página que escribía el suyo a mano se
 * llevaba por delante las alternativas heredadas y, de paso, declaraba una
 * canónica sin idioma: la versión alemana de una ficha decía ser la misma
 * URL que la española, que es pedirle a un buscador que no la indexe.
 *
 * Medido antes de arreglarlo: la portada servía once alternativas y el
 * buscador y las fichas, ninguna.
 */
export function alternativas(
  locale: string,
  ruta = '',
): { canonical: string; languages: Record<string, string> } {
  const languages = Object.fromEntries(
    routing.locales.map((otro: Idioma) => [otro, urlDe(otro, ruta)]),
  );

  return {
    canonical: urlDe(locale, ruta),
    languages: {
      ...languages,
      'x-default': urlDe(routing.defaultLocale, ruta),
    },
  };
}

/** Lo que no puede salir en crudo dentro de una etiqueta <script>. */
const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Serializa datos estructurados para incrustarlos en un <script>.
 *
 * JSON.stringify no escapa el menor-que. Un profesional podía titular su
 * servicio `</script><script>…` y ese texto salía tal cual dentro de la
 * etiqueta JSON-LD: el navegador daba por cerrado el bloque y ejecutaba lo
 * que viniera detrás, en la ficha pública que ve cualquier visitante. Con el
 * token de sesión en localStorage, como estaba entonces, eso era robo de
 * sesión. Hoy la sesión va en una cookie que el script no puede leer, pero
 * sigue pudiendo actuar en nombre de quien abre la ficha mientras la tenga
 * abierta, y desde el panel de moderación eso es una cuenta de administración.
 *
 * Se escapan también los separadores de línea de Unicode: son saltos de línea
 * válidos en JavaScript, pero no dentro de una cadena JSON.
 */
export const jsonParaScript = (datos: unknown): string =>
  JSON.stringify(datos).replace(
    /[<>&\u2028\u2029]/g,
    (caracter) => ESCAPES[caracter],
  );
