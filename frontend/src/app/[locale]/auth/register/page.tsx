'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { useAuthStore } from '@/lib/auth-store';
import { textoDeError } from '@/lib/errores-api';
import { rutaInterna, useParametroDeLaDireccion } from '@/lib/ruta-interna';
import { MapPin, Eye, EyeOff, User, Briefcase } from 'lucide-react';

/** Lo que admite la API: bcrypt ignora lo que pase de 72. */
const MAXIMO_CONTRASENA = 72;
const MAXIMO_NOMBRE = 100;

interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'client' | 'provider';
  aceptaTerminos: boolean;
}

export default function RegisterPage() {
  const t = useTranslations('acceso');
  const tValidacion = useTranslations('validacion');
  const tErrores = useTranslations('erroresApi');
  const router = useRouter();
  const { register: registerUser, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  // Adónde ir tras registrarse, si se llegó desde una página que lo pedía:
  // se ignoraba, y quien pulsaba «Reservar» sin cuenta acababa en la
  // portada.
  const destino = useParametroDeLaDireccion('redirect');

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterForm>({ defaultValues: { role: 'client' } });

  // useWatch y no watch: watch devuelve funciones que el compilador de React
  // no puede memorizar sin riesgo, y la regla lo marca. useWatch se suscribe
  // solo a estos dos campos y es lo que recomienda la propia biblioteca.
  const password = useWatch({ control, name: 'password' });
  const selectedRole = useWatch({ control, name: 'role' });

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    try {
      const { confirmPassword, ...registerData } = data;
      await registerUser(registerData);
      router.push(rutaInterna(destino));
    } catch (err) {
      // Antes se pegaban los mensajes de la API, en castellano o en inglés
      // según de dónde vinieran, fuera cual fuera el idioma de la página.
      setError(textoDeError(err, tErrores, t('errorCrear')));
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <MapPin
            className="mx-auto mb-3 h-10 w-10 text-primary-500"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-principal">
            {t('crearTitulo')}
          </h1>
          <p className="mt-2 text-sm text-secundario">{t('crearSubtitulo')}</p>
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

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Selector de rol */}
            <fieldset className="mb-5">
              <legend className="label mb-2">{t('queQuieres')}</legend>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-acento focus-within:ring-offset-2 ${
                    selectedRole === 'client'
                      ? 'border-acento bg-primary-50 dark:bg-primary-900/30'
                      : 'border-borde hover:border-borde'
                  }`}
                >
                  <input
                    type="radio"
                    value="client"
                    className="sr-only"
                    {...register('role')}
                  />
                  <User
                    className={`h-6 w-6 ${selectedRole === 'client' ? 'text-primary-500' : 'text-tenue'}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{t('rolCliente')}</span>
                </label>
                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-acento focus-within:ring-offset-2 ${
                    selectedRole === 'provider'
                      ? 'border-acento bg-primary-50 dark:bg-primary-900/30'
                      : 'border-borde hover:border-borde'
                  }`}
                >
                  <input
                    type="radio"
                    value="provider"
                    className="sr-only"
                    {...register('role')}
                  />
                  <Briefcase
                    className={`h-6 w-6 ${selectedRole === 'provider' ? 'text-primary-500' : 'text-tenue'}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">
                    {t('rolProfesional')}
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="label">
                  {t('nombre')}
                </label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  className="input-field"
                  aria-invalid={!!errors.firstName}
                  aria-describedby={
                    errors.firstName ? 'firstName-error' : undefined
                  }
                  {...register('firstName', {
                    required: tValidacion('obligatorio'),
                    maxLength: {
                      value: MAXIMO_NOMBRE,
                      message: tValidacion('maximoCaracteres', {
                        max: MAXIMO_NOMBRE,
                      }),
                    },
                  })}
                />
                {errors.firstName && (
                  <p id="firstName-error" className="error-text">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="lastName" className="label">
                  {t('apellidos')}
                </label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  className="input-field"
                  aria-invalid={!!errors.lastName}
                  aria-describedby={
                    errors.lastName ? 'lastName-error' : undefined
                  }
                  {...register('lastName', {
                    required: tValidacion('obligatorio'),
                    maxLength: {
                      value: MAXIMO_NOMBRE,
                      message: tValidacion('maximoCaracteres', {
                        max: MAXIMO_NOMBRE,
                      }),
                    },
                  })}
                />
                {errors.lastName && (
                  <p id="lastName-error" className="error-text">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="reg-email" className="label">
                {t('email')}
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                className="input-field"
                placeholder={t('emailPlaceholder')}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'reg-email-error' : undefined}
                {...register('email', {
                  required: tValidacion('emailObligatorio'),
                  // Con al menos dos letras tras el último punto, como pide
                  // la API: «ana@correo.c» pasaba aquí y allí no.
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/,
                    message: tValidacion('emailInvalido'),
                  },
                })}
              />
              {errors.email && (
                <p id="reg-email-error" className="error-text">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="reg-password" className="label">
                {t('password')}
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-field pe-10"
                  placeholder={t('passwordMinimo')}
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? 'reg-password-error' : undefined
                  }
                  {...register('password', {
                    required: tValidacion('passwordObligatoria'),
                    minLength: {
                      value: 8,
                      message: tValidacion('minimoCaracteres'),
                    },
                    maxLength: {
                      value: MAXIMO_CONTRASENA,
                      message: tValidacion('maximoCaracteres', {
                        max: MAXIMO_CONTRASENA,
                      }),
                    },
                  })}
                />
                <button
                  type="button"
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-tenue"
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
                <p id="reg-password-error" className="error-text">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="confirmPassword" className="label">
                {t('confirmar')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className="input-field"
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={
                  errors.confirmPassword ? 'confirmPassword-error' : undefined
                }
                {...register('confirmPassword', {
                  required: tValidacion('confirmaPassword'),
                  validate: (value) =>
                    value === password || tValidacion('passwordsNoCoinciden'),
                })}
              />
              {errors.confirmPassword && (
                <p id="confirmPassword-error" className="error-text">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Los términos exigen la mayoría de edad, y el registro no
                pedía nada: ni aceptarlos ni decir que se es mayor de edad.
                Los enlaces se abren aparte, para no perder lo escrito. */}
            <div className="mb-6">
              <label className="flex items-start gap-2 text-sm text-secundario">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
                  aria-invalid={!!errors.aceptaTerminos}
                  aria-describedby={
                    errors.aceptaTerminos ? 'terminos-error' : undefined
                  }
                  {...register('aceptaTerminos', {
                    required: t('debesAceptar'),
                  })}
                />
                <span>
                  {t.rich('aceptoTerminos', {
                    terminos: (texto) => (
                      <Link
                        href="/terms"
                        target="_blank"
                        className="font-medium text-acento underline"
                      >
                        {texto}
                      </Link>
                    ),
                    privacidad: (texto) => (
                      <Link
                        href="/privacy"
                        target="_blank"
                        className="font-medium text-acento underline"
                      >
                        {texto}
                      </Link>
                    ),
                  })}
                </span>
              </label>
              {errors.aceptaTerminos && (
                <p id="terminos-error" className="error-text">
                  {errors.aceptaTerminos.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? t('creando') : t('crear')}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-secundario">
            {t('yaTienesCuenta')}{' '}
            <Link
              href={
                destino
                  ? {
                      pathname: '/auth/login',
                      query: { redirect: rutaInterna(destino) },
                    }
                  : '/auth/login'
              }
              className="font-medium text-acento hover:underline"
            >
              {t('iniciaSesion')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
