import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { alternativas, grafoAbierto } from '@/lib/seo';

// Los metadatos del buscador. Son generados, no una constante: una constante
// no puede saber en qué idioma se está sirviendo, así que las diez versiones
// compartían título y descripción en castellano.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    title: t('buscadorTitulo'),
    description: t('buscadorDescripcion'),
    alternates: alternativas(locale, '/services/search'),
    openGraph: grafoAbierto(locale, {
      titulo: t('buscadorTitulo'),
      descripcion: t('buscadorDescripcion'),
      ruta: '/services/search',
    }),
  };
}

export default function BuscadorLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
