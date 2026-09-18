import { routing, type Idioma } from '@/i18n/routing';
import { SITIO_URL } from '@/lib/sitio';

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
export function alternativas(locale: string, ruta = '') {
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
