import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NoEncontrado() {
  const t = useTranslations('noEncontrado');

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-6xl font-bold text-primary-500">404</p>
      <h1 className="mt-4 text-2xl font-bold text-principal">{t('titulo')}</h1>
      <p className="mt-2 text-secundario">{t('texto')}</p>
      <Link href="/" className="btn-primary mt-8">
        {t('volver')}
      </Link>
    </div>
  );
}
