import type { MetadataRoute } from 'next';
import { SITIO_URL } from '@/lib/sitio';
import { routing } from '@/i18n/routing';

// Se regenera cada hora en lugar de fijarse en la compilación: así los
// servicios nuevos entran solos y, si la API está dormida al compilar, el
// despliegue no falla por ello.
export const revalidate = 3600;

interface ServicioDelSitemap {
  id: string;
  updatedAt?: string;
}

/**
 * URL absoluta de una ruta en un idioma. El idioma por defecto va sin prefijo
 * porque el enrutado está configurado como «as-needed».
 */
const urlDe = (idioma: string, ruta: string): string =>
  idioma === routing.defaultLocale
    ? `${SITIO_URL}${ruta}`
    : `${SITIO_URL}/${idioma}${ruta}`;

/** Mapa hreflang de una ruta: la misma página en todos los idiomas. */
const alternativasDe = (ruta: string): Record<string, string> =>
  Object.fromEntries(
    routing.locales.map((idioma) => [idioma, urlDe(idioma, ruta)]),
  );

/**
 * Pide a la API los servicios publicados. Si no responde, se devuelve una
 * lista vacía: es preferible un sitemap con solo las páginas fijas que un
 * despliegue roto.
 */
async function obtenerServicios(): Promise<ServicioDelSitemap[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    // Next incrusta esta variable durante la compilación. Sin ella el sitemap
    // se publica solo con las páginas fijas y las fichas de servicio quedan
    // fuera de los buscadores, cosa que pasaría inadvertida sin este aviso.
    console.warn(
      'sitemap: NEXT_PUBLIC_API_URL no está definida, se omiten las fichas de servicio',
    );
    return [];
  }

  try {
    const respuesta = await fetch(`${apiUrl}/services/search?limit=50`, {
      signal: AbortSignal.timeout(15000),
      next: { revalidate },
    });
    if (!respuesta.ok) return [];

    const cuerpo = await respuesta.json();
    return Array.isArray(cuerpo) ? cuerpo : cuerpo.data || [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ahora = new Date();

  const rutasFijas = [
    { ruta: '', changeFrequency: 'weekly' as const, priority: 1 },
    {
      ruta: '/services/search',
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    { ruta: '/about', changeFrequency: 'monthly' as const, priority: 0.5 },
    { ruta: '/terms', changeFrequency: 'yearly' as const, priority: 0.3 },
    { ruta: '/privacy', changeFrequency: 'yearly' as const, priority: 0.3 },
  ];

  // Una entrada por idioma, y cada una declara al resto como alternativas
  // para que los buscadores las traten como la misma página traducida.
  const paginasFijas: MetadataRoute.Sitemap = rutasFijas.flatMap((pagina) =>
    routing.locales.map((idioma) => ({
      url: urlDe(idioma, pagina.ruta),
      lastModified: ahora,
      changeFrequency: pagina.changeFrequency,
      priority: pagina.priority,
      alternates: { languages: alternativasDe(pagina.ruta) },
    })),
  );

  // Las fichas solo se publican en el idioma por defecto: la interfaz está
  // traducida, pero el texto que escribe el profesional está en español y
  // anunciar diez versiones del mismo contenido sería engañoso.
  const servicios = await obtenerServicios();
  const fichas: MetadataRoute.Sitemap = servicios.map((servicio) => ({
    url: urlDe(routing.defaultLocale, `/services/${servicio.id}`),
    lastModified: servicio.updatedAt ? new Date(servicio.updatedAt) : ahora,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...paginasFijas, ...fichas];
}
