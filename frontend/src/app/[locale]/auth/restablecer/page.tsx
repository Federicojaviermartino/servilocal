'use client';

import { useState, Suspense, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useValidacion } from '@/lib/validacion';
import { useSearchParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useRouter } from '@/i18n/navigation';
import { authApi } from '@/lib/api';
import { textoDeError } from '@/lib/errores-api';

/**
 * Elegir contraseña nueva con el enlace que llegó por correo.
 *
 * Al guardarla, la API cierra todas las sesiones de la cuenta: si alguien
 * había entrado con la contraseña vieja, se queda fuera. Por eso después se
 * lleva a iniciar sesión, y no directamente dentro.
 */
function Restablecer() {
  const t = useTranslations('acceso');
  const tValidacion = useTranslations('validacion');
  const tErrores = useTranslations('erroresApi');
  const { errores, comprobar, alCambiar, describir } = useValidacion();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!comprobar(e.currentTarget)) return;
    setError('');
    if (nueva !== repetida) {
      setError(tValidacion('passwordsNoCoinciden'));
      return;
    }
    setGuardando(true);
    try {
      await authApi.restablecer(token, nueva);
      toast.success(t('restablecida'));
      router.push('/auth/login');
    } catch (err) {
      setError(textoDeError(err, tErrores, t('errorRestablecer')));
      setGuardando(false);
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
            {t('restablecerTitulo')}
          </h1>
          <p className="mt-2 text-sm text-secundario">
            {t('restablecerTexto')}
          </p>
        </div>

        <div className="card">
          {!token ? (
            <p
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {t('enlaceIncompleto')}
            </p>
          ) : (
            <form
              method="post"
              noValidate
              onSubmit={guardar}
              onChange={alCambiar}
            >
              {/* POST, como el registro: ver register/page.tsx. */}
              {error && (
                <div
                  className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <div className="mb-4">
                <label htmlFor="restablecer-nueva" className="label">
                  {t('passwordNueva')}
                </label>
                <input
                  id="restablecer-nueva"
                  name="nueva"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  className="input-field"
                  placeholder={t('passwordMinimo')}
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  {...describir('nueva', 'restablecer-nueva')}
                />
                {errores.nueva && (
                  <p id="restablecer-nueva-error" className="error-text">
                    {errores.nueva}
                  </p>
                )}
              </div>
              <div className="mb-6">
                <label htmlFor="restablecer-repetida" className="label">
                  {t('confirmar')}
                </label>
                <input
                  id="restablecer-repetida"
                  name="repetida"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="input-field"
                  value={repetida}
                  onChange={(e) => setRepetida(e.target.value)}
                  {...describir('repetida', 'restablecer-repetida')}
                />
                {errores.repetida && (
                  <p id="restablecer-repetida-error" className="error-text">
                    {errores.repetida}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={guardando}
                className="btn-primary w-full"
              >
                {guardando ? t('guardando') : t('restablecerGuardar')}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/auth/recuperar"
            className="font-medium text-acento hover:underline"
          >
            {t('olvidaste')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RestablecerPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-8rem)]" />}>
      <Restablecer />
    </Suspense>
  );
}
