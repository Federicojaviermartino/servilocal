'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/lib/auth-store';
import { MapPin, Eye, EyeOff } from 'lucide-react';

interface LoginForm {
  email: string;
  password: string;
}

// Cuentas del seed de demostración. Se publican a propósito: el objetivo es
// que cualquiera pueda recorrer la aplicación sin registrarse ni teclear nada.
const PASSWORD_DEMO = 'Password123!';

const CUENTAS_DEMO = [
  {
    etiqueta: 'Cliente',
    email: 'laura@ejemplo.com',
    descripcion: 'Busca, reserva y valora servicios',
  },
  {
    etiqueta: 'Profesional',
    email: 'carlos@ejemplo.com',
    descripcion: 'Publica servicios y gestiona sus reservas',
  },
];

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
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
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError('Error al iniciar sesión. Verifica tus credenciales.');
      } else if (!err?.response) {
        setError(
          'No se pudo contactar con el servidor. Inténtalo de nuevo en unos segundos.',
        );
      } else {
        setError(
          err?.response?.data?.message ||
            'Servicio no disponible. Inténtalo de nuevo más tarde.',
        );
      }
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
          <h1 className="text-2xl font-bold text-gray-900">Iniciar sesión</h1>
          <p className="mt-2 text-sm text-gray-600">
            Accede a tu cuenta de ServiLocal
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

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="label">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input-field"
                placeholder="tu@email.com"
                aria-describedby={errors.email ? 'email-error' : undefined}
                aria-invalid={!!errors.email}
                {...register('email', {
                  required: 'El email es obligatorio',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Introduce un email válido',
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
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input-field pr-10"
                  placeholder="Tu contraseña"
                  aria-describedby={
                    errors.password ? 'password-error' : undefined
                  }
                  aria-invalid={!!errors.password}
                  {...register('password', {
                    required: 'La contraseña es obligatoria',
                  })}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
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
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-primary-100 bg-primary-50 p-4">
            <p className="text-sm font-medium text-gray-900">
              Acceso de demostración
            </p>
            <p className="mt-1 text-xs text-gray-600">
              Entra con un clic y recorre la aplicación con datos de prueba.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {CUENTAS_DEMO.map((cuenta) => (
                <button
                  key={cuenta.email}
                  type="button"
                  onClick={() => iniciarSesion(cuenta.email, PASSWORD_DEMO)}
                  disabled={isLoading}
                  title={cuenta.descripcion}
                  className="rounded-md border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cuenta.etiqueta}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              También puedes entrar a mano con cualquiera de esos correos y la
              contraseña <span className="font-medium">{PASSWORD_DEMO}</span>.
            </p>
          </div>

          <p className="mt-4 text-center text-sm text-gray-600">
            ¿No tienes cuenta?{' '}
            <Link
              href="/auth/register"
              className="font-medium text-primary-500 hover:text-primary-600"
            >
              Regístrate aquí
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
