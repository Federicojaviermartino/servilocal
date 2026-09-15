import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { SITIO_URL } from '@/lib/sitio';
import { routing, direccionDe, type Idioma } from '@/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'] });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Idioma };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' });

  // Una alternativa por idioma para que los buscadores sepan que son la misma
  // página en distintas lenguas y no las tomen por contenido duplicado.
  const languages = Object.fromEntries(
    routing.locales.map((otro) => [
      otro,
      otro === routing.defaultLocale ? SITIO_URL : `${SITIO_URL}/${otro}`,
    ]),
  );

  return {
    metadataBase: new URL(SITIO_URL),
    title: { default: t('titulo'), template: '%s | ServiLocal' },
    description: t('descripcion'),
    authors: [{ name: 'Federico Javier Martino' }],
    alternates: {
      canonical:
        locale === routing.defaultLocale ? SITIO_URL : `${SITIO_URL}/${locale}`,
      languages: { ...languages, 'x-default': SITIO_URL },
    },
    openGraph: {
      type: 'website',
      locale,
      siteName: 'ServiLocal',
      title: t('titulo'),
      description: t('descripcion'),
    },
  };
}

export default async function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: Idioma };
}) {
  if (!routing.locales.includes(locale)) notFound();

  // Permite que las páginas se generen estáticamente por idioma.
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'comun' });

  return (
    <html lang={locale} dir={direccionDe(locale)} suppressHydrationWarning>
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
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary-500 focus:px-4 focus:py-2 focus:text-white"
        >
          {t('irAlContenido')}
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'ServiLocal',
              url: SITIO_URL,
              inLanguage: locale,
              description: t('descripcionSitio'),
              potentialAction: {
                '@type': 'SearchAction',
                target: `${SITIO_URL}/services/search?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        <NextIntlClientProvider messages={messages}>
          <Header />
          <main id="main-content" className="flex-1" role="main">
            {children}
          </main>
          <Footer />
        </NextIntlClientProvider>
        <Toaster
          position="top-right"
          toastOptions={{ duration: 4000, style: { fontSize: '0.875rem' } }}
        />
      </body>
    </html>
  );
}
