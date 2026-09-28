import { ReactNode } from 'react';
import { paginaPrivada } from '@/lib/metadatos';

export const generateMetadata = paginaPrivada('meta', 'reservarTitulo');

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
