import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Se excluyen la API, los recursos de Next y cualquier ruta con extensión
  // (robots.txt, sitemap.xml, imágenes), que no deben llevar prefijo de idioma.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
