import { useLocale } from 'next-intl';

/** El idioma en que está escrito el catálogo. */
export const IDIOMA_DEL_CATALOGO = 'es';

/**
 * El atributo `lang` de lo que escriben los profesionales y sus clientes en
 * el catálogo: títulos, descripciones, presentaciones y valoraciones.
 *
 * La interfaz está en diez idiomas y el catálogo, en castellano. Sin
 * marcarlo, en /ar o en /de un lector de pantalla leía ese castellano con la
 * voz del idioma de la página, y no se entendía: es el criterio 3.1.2 de las
 * WCAG, y axe no lo detecta porque no sabe en qué idioma está un texto.
 *
 * En la página en castellano devuelve undefined, que es no poner el
 * atributo: allí ya lo dice el documento.
 *
 * Da por hecho el castellano, que es en lo que está escrito todo hoy. El día
 * que un servicio se pueda publicar en otro idioma, habrá que guardarlo con
 * él y leerlo de ahí.
 */
export function useIdiomaDelCatalogo(): string | undefined {
  return useLocale() === IDIOMA_DEL_CATALOGO ? undefined : IDIOMA_DEL_CATALOGO;
}
