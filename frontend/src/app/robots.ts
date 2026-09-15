import type { MetadataRoute } from 'next';
import { SITIO_URL } from '@/lib/sitio';
import { routing } from '@/i18n/routing';

/** Rutas privadas, tal como se escriben sin prefijo de idioma. */
const PRIVADAS = [
  '/dashboard/',
  '/bookings/',
  '/admin',
  '/auth/',
  '/services/*/book',
];

/**
 * Se bloquea todo lo que hay detrás de una sesión. No aporta nada a un
 * buscador y, sobre todo, evita que aparezcan en resultados rutas privadas
 * como el detalle de una reserva o una conversación.
 *
 * Cada ruta se repite con el prefijo de cada idioma: sin eso, /en/dashboard/
 * quedaría indexable aunque /dashboard/ no lo estuviera.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = PRIVADAS.flatMap((ruta) => [
    ruta,
    ...routing.locales
      .filter((idioma) => idioma !== routing.defaultLocale)
      .map((idioma) => `/${idioma}${ruta}`),
  ]);

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow,
    },
    sitemap: `${SITIO_URL}/sitemap.xml`,
  };
}
