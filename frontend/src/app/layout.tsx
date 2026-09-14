import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { SITIO_URL } from '@/lib/sitio';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  // Necesario para que las URLs de Open Graph se resuelvan como absolutas.
  metadataBase: new URL(SITIO_URL),
  title: {
    default: 'ServiLocal - Servicios locales cerca de ti',
    template: '%s | ServiLocal',
  },
  description:
    'Encuentra profesionales de confianza en tu zona. Fontanería, electricidad, clases particulares y más. Reserva, paga y valora de forma segura.',
  keywords: [
    'servicios locales',
    'profesionales',
    'marketplace',
    'reservas',
    'fontanero',
    'electricista',
  ],
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
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Corre antes de pintar: sin esto la página aparecería en claro y
            saltaría a oscuro al hidratar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tema');var oscuro=t==='oscuro'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',oscuro);}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} flex min-h-screen flex-col`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary-500 focus:px-4 focus:py-2 focus:text-white"
        >
          Ir al contenido principal
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'ServiLocal',
              url: SITIO_URL,
              inLanguage: 'es-ES',
              description:
                'Marketplace de servicios del hogar que conecta clientes con profesionales de su zona.',
              potentialAction: {
                '@type': 'SearchAction',
                target: `${SITIO_URL}/services/search?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
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
