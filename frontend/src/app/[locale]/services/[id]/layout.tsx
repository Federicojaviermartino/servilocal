import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SITIO_URL } from '@/lib/sitio';
import { IMAGEN_SOCIAL, urlDe, jsonParaScript } from '@/lib/seo';
import { routing } from '@/i18n/routing';
import { claveUnidad } from '@/lib/unidad-clave';
import { formatearImporte } from '@/lib/importes';
import { obtenerServicio } from '@/lib/servicio-servidor';
import type { Service } from '@/types';

/**
 * Las etiquetas y los datos estructurados de la ficha: un buscador los
 * necesita en el HTML inicial, antes de que corra ningún JavaScript. La
 * petición es la misma que hace la página (ver servicio-servidor.ts).
 */

async function resumen(locale: string, servicio: Service): Promise<string> {
  const t = await getTranslations({ locale, namespace: 'meta' });
  const tUnidades = await getTranslations({ locale, namespace: 'unidades' });

  const clave = claveUnidad(servicio.priceUnit);
  const unidad = tUnidades.has(clave as never)
    ? tUnidades(clave as never)
    : servicio.priceUnit;

  const precio = servicio.priceMax
    ? t('servicioPrecioRango', {
        min: formatearImporte(servicio.priceMin, locale),
        max: formatearImporte(servicio.priceMax, locale),
        unidad,
      })
    : t('servicioPrecioDesde', {
        min: formatearImporte(servicio.priceMin, locale),
        unidad,
      });

  return t('servicioResumen', {
    descripcion: servicio.description.slice(0, 130),
    precio,
    ciudad: servicio.city,
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const resultado = await obtenerServicio(id);
  const t = await getTranslations({ locale, namespace: 'meta' });

  if (resultado.estado !== 'ok') {
    return {
      title: t('servicioAusenteTitulo'),
      description: t('servicioAusenteDescripcion'),
      // Con la API caída se sirve igual, pero no hay contenido que indexar:
      // sin esto, un buscador que pase durante el apagón se queda con una
      // ficha vacía como versión buena de esa dirección.
      robots: { index: false, follow: true },
    };
  }

  const servicio = resultado.servicio;

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
      siteName: 'ServiLocal',
      locale,
      title: titulo,
      description: descripcion,
      url: `${SITIO_URL}/services/${servicio.id}`,
      // La foto del servicio o, sin ella, la del sitio: las fichas sin foto
      // se compartían sin imagen.
      images: imagen ? [{ url: imagen }] : [IMAGEN_SOCIAL],
    },
  };
}

/** Datos estructurados schema.org para que el servicio pueda aparecer enriquecido. */
function datosEstructurados(servicio: Service) {
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
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resultado = await obtenerServicio(id);

  // Solo cuando la API ha dicho que no existe. Con la API caída se sigue
  // sirviendo la página, que se apañará desde el navegador.
  if (resultado.estado === 'no-existe') notFound();

  return (
    <>
      {resultado.estado === 'ok' && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonParaScript(datosEstructurados(resultado.servicio)),
          }}
        />
      )}
      {children}
    </>
  );
}
