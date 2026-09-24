/**
 * Nivel atómico: Molécula
 * Componente: EstadoCarga (qué se enseña mientras no hay datos)
 */
'use client';
import { useTranslations } from 'next-intl';
import { AlertTriangle, LogIn, RefreshCw } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { EstadoCarga as Estado } from '@/lib/carga';
import Button from '../atoms/Button';
import Spinner from '../atoms/Spinner';

interface EstadoCargaProps {
  estado: Estado;
  onReintentar?: () => void;
  /** Identificador de la petición que falló, para dárselo a quien lo mire. */
  referencia?: string;
  /** Lo que se pinta cuando ya está listo. Sin él, solo los otros estados. */
  children?: React.ReactNode;
}

/**
 * Envuelve el contenido de una pantalla y decide qué se ve antes de él.
 *
 * Un fallo se cuenta y se ofrece reintentar; una sesión caducada se cuenta y
 * se ofrece volver a entrar, que es otro remedio distinto. Lo que no se hace
 * es pintar la pantalla vacía, que es lo que había: quien la veía no podía
 * distinguir «no tienes nada» de «no he podido preguntar».
 */
export default function EstadoCarga({
  estado,
  onReintentar,
  referencia,
  children,
}: EstadoCargaProps) {
  const t = useTranslations('carga');

  if (estado === 'cargando') {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (estado === 'sesion') {
    return (
      <div
        role="status"
        className="rounded-lg border border-borde bg-superficie p-8 text-center"
      >
        <LogIn className="mx-auto h-8 w-8 text-secundario" aria-hidden="true" />
        <p className="mt-3 font-medium text-principal">{t('sesionCaducada')}</p>
        <p className="mt-1 text-sm text-secundario">{t('sesionTexto')}</p>
        <Link
          href="/auth/login"
          className="mt-4 inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          {t('entrarDeNuevo')}
        </Link>
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div
        role="alert"
        className="rounded-lg border border-borde bg-superficie p-8 text-center"
      >
        <AlertTriangle
          className="mx-auto h-8 w-8 text-warning-600"
          aria-hidden="true"
        />
        <p className="mt-3 font-medium text-principal">{t('error')}</p>
        <p className="mt-1 text-sm text-secundario">{t('errorTexto')}</p>
        {referencia && (
          <p className="mt-2 text-xs text-tenue">
            {t('referencia')}{' '}
            <code className="select-all font-mono">{referencia}</code>
          </p>
        )}
        {onReintentar && (
          <Button
            variant="secondary"
            size="md"
            onClick={onReintentar}
            className="mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw size={16} aria-hidden="true" />
            {t('reintentar')}
          </Button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
