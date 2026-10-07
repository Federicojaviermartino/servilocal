'use client';

import { useState, Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/lib/auth-store';
import { textoDeError } from '@/lib/errores-api';
import { rutaInterna } from '@/lib/ruta-interna';
import { MapPin, Eye, EyeOff } from 'lucide-react';

interface LoginForm {
  email: string;
  password: string;
}

// Cuentas del seed de demostración. Se publican a propósito: el objetivo es
// que cualquiera pueda recorrer la aplicación sin registrarse ni teclear nada.
const PASSWORD_DEMO = 'Password123!';

const CUENTAS_DEMO = [
  { clave: 'Cliente', email: 'laura@ejemplo.com' },
  { clave: 'Profesional', email: 'carlos@ejemplo.com' },
  // Administración va en solo lectura: quien la use ve el panel entero, y el
  // servidor le rechaza cualquier escritura. Sin eso, el primer visitante
  // podría desactivar usuarios y dejar la demostración rota para el siguiente.
  { clave: 'Administracion', email: 'demo@servilocal.com' },
] as const;

function LoginPageContent() {
  const t = useTranslations('acceso');
  const tValidacion = useTranslations('validacion');
  const tErrores = useTranslations('erroresApi');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = rutaInterna(searchParams.get('redirect'));
  const { login, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const iniciarSesion = async (email: string, password: string) => {
    setError('');
    try {
      await login(email, password);
      router.replace(redirectTo);
    } catch (err: any) {
      // Nunca el mensaje de la API: está en castellano, sea cual sea el
      // idioma de quien entra. El código dice qué pasó.
      setError(
        err?.response
          ? textoDeError(err, tErrores, t('errorServicio'))
          : t('errorRed'),
      );
    }
  };

  const onSubmit = async (data: LoginForm) =>
    iniciarSesion(data.email, data.password);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <MapPin
            className="mx-auto mb-3 h-10 w-10 text-primary-500"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-principal">
            {t('iniciarTitulo')}
          </h1>
          <p className="mt-2 text-sm text-secundario">
            {t('iniciarSubtitulo')}
          </p>
        </div>

        <div className="card">
          {error && (
            <div
              className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* POST, como el registro. Este formulario solo se pinta en el
              navegador, pero si un día llegara del servidor, enviado antes de
              que cargue el JavaScript iría por GET, con la contraseña en la
              dirección: ver register/page.tsx. */}
          <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="label">
                {t('email')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input-field"
                placeholder={t('emailPlaceholder')}
                aria-describedby={errors.email ? 'email-error' : undefined}
                aria-invalid={!!errors.email}
                {...register('email', {
                  required: tValidacion('emailObligatorio'),
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: tValidacion('emailInvalido'),
                  },
                })}
              />
              {errors.email && (
                <p id="email-error" className="error-text">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="label">
                {t('password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input-field pe-10"
                  placeholder={t('passwordPlaceholder')}
                  aria-describedby={
                    errors.password ? 'password-error' : undefined
                  }
                  aria-invalid={!!errors.password}
                  {...register('password', {
                    required: tValidacion('passwordObligatoria'),
                  })}
                />
                <button
                  type="button"
                  className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-tenue hover:text-principal"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? t('ocultarPassword') : t('mostrarPassword')
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="error-text">
                  {errors.password.message}
                </p>
              )}
              <p className="mt-2 text-end text-sm">
                <Link
                  href="/auth/recuperar"
                  className="text-acento hover:underline"
                >
                  {t('olvidaste')}
                </Link>
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? t('entrando') : t('entrar')}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-primary-100 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20">
            <p className="text-sm font-medium text-principal">
              {t('demoTitulo')}
            </p>
            <p className="mt-1 text-xs text-secundario">{t('demoTexto')}</p>
            {/* Una cuenta por fila: en tres columnas, dentro de una tarjeta
                tan estrecha, los correos se partían a mitad de palabra. */}
            <div className="mt-3 grid gap-2">
              {CUENTAS_DEMO.map((cuenta) => (
                <button
                  key={cuenta.email}
                  type="button"
                  onClick={() => iniciarSesion(cuenta.email, PASSWORD_DEMO)}
                  disabled={isLoading}
                  // Con su variante oscura: el azul claro del modo claro
                  // dejaba el texto a 2:1 al pasar el ratón en el oscuro.
                  className="rounded-md border border-primary-200 bg-superficie px-3 py-2 text-start transition-colors hover:bg-primary-100 dark:hover:bg-primary-900/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-medium text-acento">
                      {t(`demo${cuenta.clave}`)}
                    </span>
                    <span className="break-all text-xs text-tenue">
                      {cuenta.email}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-secundario">
                    {t(`demo${cuenta.clave}Descripcion`)}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-tenue">
              {t('demoManual')}{' '}
              <span className="font-medium">{PASSWORD_DEMO}</span>
            </p>
          </div>

          <p className="mt-4 text-center text-sm text-secundario">
            {t('sinCuenta')}{' '}
            {/* Con el destino: quien pulsaba «Reservar» sin cuenta y se
                registraba acababa en la portada. */}
            <Link
              href={
                searchParams.get('redirect')
                  ? {
                      pathname: '/auth/register',
                      query: { redirect: redirectTo },
                    }
                  : '/auth/register'
              }
              className="font-medium text-acento hover:underline"
            >
              {t('registrateAqui')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-8rem)]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
