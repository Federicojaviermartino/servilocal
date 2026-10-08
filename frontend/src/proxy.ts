import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import {
  cabecerasHaciaLaApi,
  destinoEnLaApi,
  esDocumentacion,
} from './lib/pasarela-api';
import { apiDelServidor } from './lib/api-servidor';

const conIdioma = createMiddleware(routing);

export default function proxy(peticion: NextRequest) {
  const { pathname, search } = peticion.nextUrl;

  // Las llamadas a la API pasan por aquí para que la cookie de sesión sea de
  // este dominio. Ver lib/pasarela-api.ts.
  if (pathname.startsWith('/api/')) {
    // La documentación no se reenvía: se manda a la dirección pública de la
    // API, que es donde tiene que abrirse. Ver esDocumentacion.
    if (esDocumentacion(pathname)) {
      return NextResponse.redirect(
        destinoEnLaApi(
          pathname,
          search,
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
        ),
      );
    }

    const api = apiDelServidor() || 'http://localhost:3001/api';
    return NextResponse.rewrite(destinoEnLaApi(pathname, search, api), {
      request: {
        headers: cabecerasHaciaLaApi(
          peticion.headers,
          process.env.PROXY_SECRETO,
        ),
      },
    });
  }

  return conIdioma(peticion);
}

export const config = {
  matcher: [
    '/api/:path*',
    // Los recursos de Next, /salud y cualquier ruta con extensión
    // (robots.txt, sitemap.xml, imágenes) no deben llevar prefijo de idioma.
    '/((?!api|salud|_next|_vercel|.*\\..*).*)',
  ],
};
