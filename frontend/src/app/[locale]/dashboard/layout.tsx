import { ReactNode } from 'react';
import DashboardLayout from '@/components/templates/DashboardLayout';
import { paginaPrivada } from '@/lib/metadatos';

export const generateMetadata = paginaPrivada('meta', 'panelTitulo');

export default function Layout({ children }: { children: ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
