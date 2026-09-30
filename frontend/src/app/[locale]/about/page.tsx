import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { alternativas, grafoAbierto } from '@/lib/seo';
import { MapPin, Shield, Star, Search } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'acercaDe' });
  // Con su canónica: heredaba la de la portada.
  return {
    title: t('metaTitulo'),
    description: t('metaDescripcion'),
    alternates: alternativas(locale, '/about'),
    openGraph: grafoAbierto(locale, {
      titulo: t('metaTitulo'),
      descripcion: t('metaDescripcion'),
      ruta: '/about',
    }),
  };
}

const ICONOS = [Search, MapPin, Shield, Star] as const;

/**
 * Con el idioma fijado aquí, la página se genera al compilar. Sin él,
 * next-intl lo leía de la petición y cada visita la volvía a pintar, sin
 * caché.
 */
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AcercaDe />;
}

function AcercaDe() {
  const t = useTranslations('acercaDe');

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-principal">{t('titulo')}</h1>
      <p className="mt-4 text-lg text-secundario">{t('intro')}</p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-principal">
          {t('comoFunciona')}
        </h2>
        <ol className="mt-4 space-y-4">
          {ICONOS.map((Icono, indice) => {
            const numero = indice + 1;
            return (
              <li key={numero} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                  <Icono size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-medium text-principal">
                    {numero}. {t(`paso${numero}Titulo` as 'paso1Titulo')}
                  </h3>
                  <p className="mt-1 text-sm text-secundario">
                    {t(`paso${numero}Texto` as 'paso1Texto')}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-principal">
          {t('profesionalesTitulo')}
        </h2>
        <p className="mt-3 text-secundario">{t('profesionalesTexto')}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-principal">
          {t('tecnologiaTitulo')}
        </h2>
        <p className="mt-3 text-secundario">{t('tecnologiaTexto')}</p>
      </section>

      <section className="mt-10 rounded-lg bg-superficie-alt p-5">
        <h2 className="text-base font-semibold text-principal">
          {t('academicoTitulo')}
        </h2>
        <p className="mt-2 text-sm text-secundario">{t('academicoTexto')}</p>
      </section>

      <p className="mt-10 text-sm text-secundario">
        {t.rich('dudas', {
          terminos: (texto) => (
            <Link href="/terms" className="text-acento hover:underline">
              {texto}
            </Link>
          ),
          privacidad: (texto) => (
            <Link href="/privacy" className="text-acento hover:underline">
              {texto}
            </Link>
          ),
        })}
      </p>
    </article>
  );
}
