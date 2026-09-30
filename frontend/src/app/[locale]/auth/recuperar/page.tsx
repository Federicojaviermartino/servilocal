'use client';

import { useState, FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useValidacion } from '@/lib/validacion';
import { KeyRound } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { authApi } from '@/lib/api';
import { textoDeError } from '@/lib/errores-api';

/**
 * Pedir un enlace para elegir contraseña nueva.
 *
 * Sin esto, quien olvidaba la contraseña perdía la cuenta. La respuesta es
 * la misma exista o no la cuenta: la API no dice quién está registrado, y
 * la pantalla tampoco.
 */
export default function RecuperarPage() {
  const t = useTranslations('acceso');
  const tErrores = useTranslations('erroresApi');
  const idioma = useLocale();
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const { errores, comprobar, alCambiar, describir } = useValidacion();

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!comprobar(e.currentTarget)) return;
    setError('');
    setEnviando(true);
    try {
      // En el idioma en que se está usando la página: es el del correo.
      await authApi.recuperar(email, idioma);
      setEnviado(true);
    } catch (err) {
      setError(textoDeError(err, tErrores, t('errorRecuperar')));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <KeyRound
            className="mx-auto mb-3 h-10 w-10 text-primary-500"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-principal">
            {t('recuperarTitulo')}
          </h1>
          <p className="mt-2 text-sm text-secundario">{t('recuperarTexto')}</p>
        </div>

        <div className="card">
          {enviado ? (
            <p
              className="rounded-lg bg-primary-50 p-3 text-sm text-principal dark:bg-primary-900/20"
              role="status"
            >
              {t('recuperarEnviado')}
            </p>
          ) : (
            <form noValidate onSubmit={enviar} onChange={alCambiar}>
              {error && (
                <div
                  className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <div className="mb-6">
                <label htmlFor="recuperar-email" className="label">
                  {t('email')}
                </label>
                <input
                  id="recuperar-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="input-field"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  {...describir('email', 'recuperar-email')}
                />
                {errores.email && (
                  <p id="recuperar-email-error" className="error-text">
                    {errores.email}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={enviando}
                className="btn-primary w-full"
              >
                {enviando ? t('enviando') : t('recuperarEnviar')}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/auth/login"
            className="font-medium text-acento hover:underline"
          >
            {t('volverAEntrar')}
          </Link>
        </p>
      </div>
    </div>
  );
}
