import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'ServiLocal - Servicios locales cerca de ti',
    template: '%s | ServiLocal',
  },
  description:
    'Encuentra profesionales de confianza en tu zona. Fontanería, electricidad, clases particulares y más. Reserva, paga y valora de forma segura.',
  keywords: ['servicios locales', 'profesionales', 'marketplace', 'reservas', 'fontanero', 'electricista'],
  authors: [{ name: 'Federico Javier Martino' }],
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'ServiLocal',
    title: 'ServiLocal - Servicios locales cerca de ti',
    description: 'Encuentra profesionales de confianza en tu zona.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} flex min-h-screen flex-col`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary-500 focus:px-4 focus:py-2 focus:text-white"
        >
          Ir al contenido principal
        </a>
        <Header />
        <main id="main-content" className="flex-1" role="main">
          {children}
        </main>
        <Footer />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { fontSize: '0.875rem' },
          }}
        />
      </body>
    </html>
  );
}
