import type { MetadataRoute } from 'next';
import { SITIO_URL } from '@/lib/sitio';

/**
 * Se bloquea todo lo que hay detrás de una sesión. No aporta nada a un
 * buscador y, sobre todo, evita que aparezcan en resultados rutas privadas
 * como el detalle de una reserva o una conversación.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard/',
        '/bookings/',
        '/admin',
        '/auth/',
        '/services/*/book',
      ],
    },
    sitemap: `${SITIO_URL}/sitemap.xml`,
  };
}
