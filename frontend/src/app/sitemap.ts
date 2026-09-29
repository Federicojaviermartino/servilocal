import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { alternativas, urlDe } from '@/lib/seo';

// Se regenera cada hora en lugar de fijarse en la compilación: así los
// servicios nuevos entran solos y, si la API está dormida al compilar, el
// despliegue no falla por ello.
export const revalidate = 3600;

interface ServicioDelSitemap {
  id: string;
  updatedAt?: string;
}

/** Lo más que devuelve la búsqueda de una vez. */
const POR_PAGINA = 50;

/** Mil fichas: el mismo tope hasta el que cuenta la búsqueda. */
const PAGINAS_MAXIMAS = 20;

/**
 * Pide a la API los servicios publicados, página a página: antes se pedía
 * una sola, y a partir del servicio 51 las fichas no llegaban al sitemap.
 * Si no responde, se devuelve lo que se tenga, aunque sea nada: es
 * preferible un sitemap con solo las páginas fijas que un despliegue roto.
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

  const servicios: ServicioDelSitemap[] = [];
  try {
    for (let pagina = 1; pagina <= PAGINAS_MAXIMAS; pagina++) {
      const respuesta = await fetch(
        `${apiUrl}/services/search?limit=${POR_PAGINA}&page=${pagina}`,
        { signal: AbortSignal.timeout(15000), next: { revalidate } },
      );
      if (!respuesta.ok) break;

      const cuerpo = await respuesta.json();
      const lote: ServicioDelSitemap[] = Array.isArray(cuerpo)
        ? cuerpo
        : cuerpo.data || [];
      servicios.push(...lote);
      const paginas = cuerpo.meta?.totalPages ?? 1;
      if (lote.length < POR_PAGINA || pagina >= paginas) break;
    }
  } catch {
    // Lo que haya llegado hasta el fallo sigue valiendo.
  }
  return servicios;
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
      alternates: { languages: alternativas(idioma, pagina.ruta).languages },
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
