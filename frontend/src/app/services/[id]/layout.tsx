import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { SITIO_URL } from '@/lib/sitio';

/**
 * La ficha de servicio es un componente de cliente, así que no puede exportar
 * metadatos por sí misma. Este layout, que sí se ejecuta en el servidor, se
 * encarga de las etiquetas y de los datos estructurados: un buscador los
 * necesita en el HTML inicial, antes de que corra ningún JavaScript.
 */

interface ServicioSeo {
  id: string;
  title: string;
  description: string;
  city: string;
  priceMin: number;
  priceMax?: number;
  priceUnit: string;
  images?: string[];
  averageRating?: number;
  totalReviews?: number;
  category?: { name: string };
  provider?: { firstName: string; lastName: string };
}

async function obtenerServicio(id: string): Promise<ServicioSeo | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;

  try {
    const respuesta = await fetch(`${apiUrl}/services/${id}`, {
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 3600 },
    });
    if (!respuesta.ok) return null;
    return await respuesta.json();
  } catch {
    // Si la API no responde se devuelven los metadatos por defecto: un fallo
    // de red no debe tumbar el renderizado de la página.
    return null;
  }
}

function resumen(servicio: ServicioSeo): string {
  const precio = servicio.priceMax
    ? `${servicio.priceMin} a ${servicio.priceMax} euros ${servicio.priceUnit}`
    : `desde ${servicio.priceMin} euros ${servicio.priceUnit}`;
  return `${servicio.description.slice(0, 130)} Precio: ${precio}. Disponible en ${servicio.city}.`;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const servicio = await obtenerServicio(params.id);

  if (!servicio) {
    return {
      title: 'Servicio',
      description: 'Detalle de un servicio publicado en ServiLocal.',
    };
  }

  const titulo = `${servicio.title} en ${servicio.city}`;
  const descripcion = resumen(servicio);
  const imagen = servicio.images?.[0];

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `${SITIO_URL}/services/${servicio.id}` },
    openGraph: {
      type: 'article',
      title: titulo,
      description: descripcion,
      url: `${SITIO_URL}/services/${servicio.id}`,
      images: imagen ? [{ url: imagen }] : undefined,
    },
  };
}

/** Datos estructurados schema.org para que el servicio pueda aparecer enriquecido. */
function datosEstructurados(servicio: ServicioSeo) {
  const datos: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: servicio.title,
    description: servicio.description,
    serviceType: servicio.category?.name,
    areaServed: { '@type': 'City', name: servicio.city },
    url: `${SITIO_URL}/services/${servicio.id}`,
    offers: {
      '@type': 'Offer',
      price: servicio.priceMin,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
  };

  if (servicio.provider) {
    datos.provider = {
      '@type': 'LocalBusiness',
      name: `${servicio.provider.firstName} ${servicio.provider.lastName}`,
      address: { '@type': 'PostalAddress', addressLocality: servicio.city },
    };
  }

  // Solo se declara la valoración si existe de verdad: publicar una media de
  // cero sobre cero reseñas es motivo de penalización en los buscadores.
  if (servicio.totalReviews && servicio.totalReviews > 0) {
    datos.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: servicio.averageRating,
      reviewCount: servicio.totalReviews,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return datos;
}

export default async function ServicioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const servicio = await obtenerServicio(params.id);

  return (
    <>
      {servicio && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(datosEstructurados(servicio)),
          }}
        />
      )}
      {children}
    </>
  );
}
