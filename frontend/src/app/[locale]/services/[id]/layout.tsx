import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SITIO_URL } from '@/lib/sitio';
import { urlDe } from '@/lib/seo';
import { routing } from '@/i18n/routing';
import { claveUnidad } from '@/lib/unidad-clave';

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

async function resumen(locale: string, servicio: ServicioSeo): Promise<string> {
  const t = await getTranslations({ locale, namespace: 'meta' });
  const tUnidades = await getTranslations({ locale, namespace: 'unidades' });

  const clave = claveUnidad(servicio.priceUnit);
  const unidad = tUnidades.has(clave as never)
    ? tUnidades(clave as never)
    : servicio.priceUnit;

  const precio = servicio.priceMax
    ? t('servicioPrecioRango', {
        min: servicio.priceMin,
        max: servicio.priceMax,
        unidad,
      })
    : t('servicioPrecioDesde', { min: servicio.priceMin, unidad });

  return t('servicioResumen', {
    descripcion: servicio.description.slice(0, 130),
    precio,
    ciudad: servicio.city,
  });
}

export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const { id, locale } = params;
  const servicio = await obtenerServicio(id);
  const t = await getTranslations({ locale, namespace: 'meta' });

  if (!servicio) {
    return {
      title: t('servicioAusenteTitulo'),
      description: t('servicioAusenteDescripcion'),
    };
  }

  const titulo = t('servicioTitulo', {
    titulo: servicio.title,
    ciudad: servicio.city,
  });
  const descripcion = await resumen(locale, servicio);
  const imagen = servicio.images?.[0];

  return {
    title: titulo,
    description: descripcion,
    alternates: {
      canonical: urlDe(routing.defaultLocale, `/services/${servicio.id}`),
    },
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
