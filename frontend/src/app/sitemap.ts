import type { MetadataRoute } from 'next';
import { SITIO_URL } from '@/lib/sitio';

// Se regenera cada hora en lugar de fijarse en la compilación: así los
// servicios nuevos entran solos y, si la API está dormida al compilar, el
// despliegue no falla por ello.
export const revalidate = 3600;

interface ServicioDelSitemap {
  id: string;
  updatedAt?: string;
}

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

  const paginasFijas: MetadataRoute.Sitemap = [
    {
      url: SITIO_URL,
      lastModified: ahora,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITIO_URL}/services/search`,
      lastModified: ahora,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITIO_URL}/about`,
      lastModified: ahora,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITIO_URL}/terms`,
      lastModified: ahora,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITIO_URL}/privacy`,
      lastModified: ahora,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  const servicios = await obtenerServicios();
  const fichas: MetadataRoute.Sitemap = servicios.map((servicio) => ({
    url: `${SITIO_URL}/services/${servicio.id}`,
    lastModified: servicio.updatedAt ? new Date(servicio.updatedAt) : ahora,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...paginasFijas, ...fichas];
}
