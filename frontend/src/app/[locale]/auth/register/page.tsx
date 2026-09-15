'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/lib/auth-store';
import { MapPin, Eye, EyeOff, User, Briefcase } from 'lucide-react';

interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'client' | 'provider';
}

export default function RegisterPage() {
  const t = useTranslations('acceso');
  const tValidacion = useTranslations('validacion');
  const router = useRouter();
  const { register: registerUser, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({ defaultValues: { role: 'client' } });

  const password = watch('password');
  const selectedRole = watch('role');

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    try {
      const { confirmPassword, ...registerData } = data;
      await registerUser(registerData);
      router.push('/');
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join('. ') : msg || t('errorCrear'));
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
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    selectedRole === 'client'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
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
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    selectedRole === 'provider'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
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
                  {...register('firstName', {
                    required: tValidacion('obligatorio'),
                    maxLength: 100,
                  })}
                />
                {errors.firstName && (
                  <p className="error-text">{errors.firstName.message}</p>
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
                  {...register('lastName', {
                    required: tValidacion('obligatorio'),
                    maxLength: 100,
                  })}
                />
                {errors.lastName && (
                  <p className="error-text">{errors.lastName.message}</p>
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
                {...register('email', {
                  required: tValidacion('emailObligatorio'),
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: tValidacion('emailInvalido'),
                  },
                })}
              />
              {errors.email && (
                <p className="error-text">{errors.email.message}</p>
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
                  {...register('password', {
                    required: tValidacion('passwordObligatoria'),
                    minLength: {
                      value: 8,
                      message: tValidacion('minimoCaracteres'),
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
                <p className="error-text">{errors.password.message}</p>
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
                {...register('confirmPassword', {
                  required: tValidacion('confirmaPassword'),
                  validate: (value) =>
                    value === password || tValidacion('passwordsNoCoinciden'),
                })}
              />
              {errors.confirmPassword && (
                <p className="error-text">{errors.confirmPassword.message}</p>
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
              href="/auth/login"
              className="font-medium text-primary-500 hover:text-primary-600"
            >
              {t('iniciaSesion')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
