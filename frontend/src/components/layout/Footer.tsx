import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';

export default function Footer() {
  const t = useTranslations('pie');

  return (
    <footer className="border-t border-borde bg-superficie" role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-tenue">
            <MapPin className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium">ServiLocal</span>
          </div>
          <nav aria-label={t('enlaces')}>
            <ul className="flex gap-6 text-sm text-tenue">
              <li>
                <Link href="/about" className="hover:text-primary-500">
                  {t('acercaDe')}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary-500">
                  {t('terminos')}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-primary-500">
                  {t('privacidad')}
                </Link>
              </li>
            </ul>
          </nav>
          <p className="text-sm text-tenue">{t('derechos')}</p>
        </div>
      </div>
    </footer>
  );
}
