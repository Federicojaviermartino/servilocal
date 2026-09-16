'use client';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { MapPin, Shield, Star } from 'lucide-react';
import SearchBar from '@/components/molecules/SearchBar';
import AsistenteBusqueda from '@/components/organisms/AsistenteBusqueda';

export default function HomePage() {
  const router = useRouter();
  const t = useTranslations('inicio');

  const handleSearch = (query: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    router.push(`/services/search?${params.toString()}`);
  };

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-700 to-primary-900 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            {t('heroTitulo')}
          </h1>
          <p className="text-lg text-primary-100 mb-8 max-w-2xl mx-auto">
            {t('heroSubtitulo')}
          </p>
          <div className="bg-superficie rounded-lg p-2 max-w-2xl mx-auto">
            <SearchBar onSearch={handleSearch} />
          </div>
        </div>
      </section>

      {/* Caracteristicas */}
      <section className="py-16 px-4 bg-fondo">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-principal mb-12">
            {t('porQueTitulo')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 text-primary-600 mb-4">
                <MapPin size={28} />
              </div>
              <h3 className="font-semibold text-lg text-principal mb-2">
                {t('cercanosTitulo')}
              </h3>
              <p className="text-secundario">{t('cercanosTexto')}</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 text-primary-600 mb-4">
                <Shield size={28} />
              </div>
              <h3 className="font-semibold text-lg text-principal mb-2">
                {t('pagosTitulo')}
              </h3>
              <p className="text-secundario">{t('pagosTexto')}</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 text-primary-600 mb-4">
                <Star size={28} />
              </div>
              <h3 className="font-semibold text-lg text-principal mb-2">
                {t('valoracionesTitulo')}
              </h3>
              <p className="text-secundario">{t('valoracionesTexto')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-principal mb-12">
            {t('comoFunciona')}
          </h2>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <li className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mb-4">
                1
              </div>
              <h3 className="font-semibold text-principal mb-2">
                {t('paso1Titulo')}
              </h3>
              <p className="text-secundario text-sm">{t('paso1Texto')}</p>
            </li>
            <li className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mb-4">
                2
              </div>
              <h3 className="font-semibold text-principal mb-2">
                {t('paso2Titulo')}
              </h3>
              <p className="text-secundario text-sm">{t('paso2Texto')}</p>
            </li>
            <li className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mb-4">
                3
              </div>
              <h3 className="font-semibold text-principal mb-2">
                {t('paso3Titulo')}
              </h3>
              <p className="text-secundario text-sm">{t('paso3Texto')}</p>
            </li>
          </ol>
        </div>
      </section>
      <AsistenteBusqueda />
    </>
  );
}
