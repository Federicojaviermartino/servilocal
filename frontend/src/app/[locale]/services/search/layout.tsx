import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { SITIO_URL } from '@/lib/sitio';

// El buscador es un componente de cliente y no puede exportar metadatos, así
// que los aporta este layout, que sí se ejecuta en el servidor.
export const metadata: Metadata = {
  title: 'Buscar servicios',
  description:
    'Encuentra fontaneros, electricistas, pintores, limpieza, reformas y clases particulares cerca de ti. Filtra por ciudad, distancia, valoración y precio.',
  alternates: { canonical: `${SITIO_URL}/services/search` },
};

export default function BuscadorLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
