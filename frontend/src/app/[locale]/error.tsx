/**
 * Lo que se ve cuando algo revienta al pintar.
 *
 * Sin este fichero, un error de renderizado en producción deja la pantalla
 * de error por defecto de Next: fondo blanco, «Application error: a
 * client-side exception has occurred», en inglés y sin salida. Para quien
 * esté navegando, eso es indistinguible de que la aplicación se haya caído.
 *
 * Aquí, al menos, hay idioma, un botón que reintenta sin recargar y la
 * referencia que Next asigna al error, que es lo único que permite atar lo
 * que vio el usuario con lo que quedó en el registro del servidor.
 */
'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Button from '@/components/atoms/Button';

export default function ErrorDePagina({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');

  useEffect(() => {
    // Next ya lo registra en el servidor. Esto es para que en el navegador
    // quede algo más que la pantalla: sin ello, quien abra la consola para
    // ayudar no ve nada.
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center"
    >
      <h1 className="text-2xl font-bold text-principal">{t('titulo')}</h1>
      <p className="mt-2 text-secundario">{t('texto')}</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>{t('reintentar')}</Button>
        <Link href="/" className="btn-secondary">
          {t('volver')}
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 text-xs text-tenue">
          {t('referencia', { codigo: error.digest })}
        </p>
      )}
    </div>
  );
}
