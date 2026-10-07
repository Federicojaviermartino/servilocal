import { defineRouting } from 'next-intl/routing';

/**
 * Idiomas disponibles. El español es el predeterminado y no lleva prefijo en
 * la URL, de modo que los enlaces existentes y el sitemap ya publicado siguen
 * siendo válidos: /services/search en español, /en/services/search en inglés.
 */
export const routing = defineRouting({
  locales: ['es', 'en', 'ca', 'gl', 'eu', 'fr', 'de', 'it', 'pt', 'ar'],
  defaultLocale: 'es',
  localePrefix: 'as-needed',
  // Las versiones en cada idioma ya van en el HTML, con el dominio del sitio
  // (ver lib/seo.ts). next-intl las repetía en una cabecera Link con el host
  // de la petición: dos fuentes para lo mismo, y fuera de producción, con
  // dominios distintos que Lighthouse veía como un canonical en conflicto.
  alternateLinks: false,
});

export type Idioma = (typeof routing.locales)[number];

/** Nombre de cada idioma en su propia lengua, como debe mostrarse al elegirlo. */
export const NOMBRES_IDIOMA: Record<Idioma, string> = {
  es: 'Español',
  en: 'English',
  ca: 'Català',
  gl: 'Galego',
  eu: 'Euskara',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ar: 'العربية',
};

/** Idiomas que se escriben de derecha a izquierda. */
export const IDIOMAS_RTL: readonly Idioma[] = ['ar'];

export const direccionDe = (idioma: Idioma): 'rtl' | 'ltr' =>
  IDIOMAS_RTL.includes(idioma) ? 'rtl' : 'ltr';
