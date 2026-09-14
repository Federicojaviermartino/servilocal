/**
 * URL pública del sitio.
 *
 * La necesitan el sitemap, robots.txt y las etiquetas Open Graph, que exigen
 * URLs absolutas. Se puede sobreescribir con NEXT_PUBLIC_SITE_URL al desplegar
 * en otro dominio sin tocar el código.
 */
export const SITIO_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://servilocal-web.onrender.com';

/** URL absoluta a partir de una ruta interna. */
export const urlAbsoluta = (ruta: string): string =>
  new URL(ruta, SITIO_URL).toString();
