'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
      setError(Array.isArray(msg) ? msg.join('. ') : msg || 'Error al crear la cuenta.');
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-primary-500" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900">Crear cuenta</h1>
          <p className="mt-2 text-sm text-gray-600">
            Únete a la comunidad ServiLocal
          </p>
        </div>

        <div className="card">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Selector de rol */}
            <fieldset className="mb-5">
              <legend className="label mb-2">¿Qué quieres hacer?</legend>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    selectedRole === 'client'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" value="client" className="sr-only" {...register('role')} />
                  <User className={`h-6 w-6 ${selectedRole === 'client' ? 'text-primary-500' : 'text-gray-400'}`} aria-hidden="true" />
                  <span className="text-sm font-medium">Buscar servicios</span>
                </label>
                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    selectedRole === 'provider'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" value="provider" className="sr-only" {...register('role')} />
                  <Briefcase className={`h-6 w-6 ${selectedRole === 'provider' ? 'text-primary-500' : 'text-gray-400'}`} aria-hidden="true" />
                  <span className="text-sm font-medium">Ofrecer servicios</span>
                </label>
              </div>
            </fieldset>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="label">Nombre</label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  className="input-field"
                  aria-invalid={!!errors.firstName}
                  {...register('firstName', { required: 'Obligatorio', maxLength: 100 })}
                />
                {errors.firstName && <p className="error-text">{errors.firstName.message}</p>}
              </div>
              <div>
                <label htmlFor="lastName" className="label">Apellidos</label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  className="input-field"
                  aria-invalid={!!errors.lastName}
                  {...register('lastName', { required: 'Obligatorio', maxLength: 100 })}
                />
                {errors.lastName && <p className="error-text">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="reg-email" className="label">Correo electrónico</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                className="input-field"
                placeholder="tu@email.com"
                aria-invalid={!!errors.email}
                {...register('email', {
                  required: 'El email es obligatorio',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email no válido' },
                })}
              />
              {errors.email && <p className="error-text">{errors.email.message}</p>}
            </div>

            <div className="mb-4">
              <label htmlFor="reg-password" className="label">Contraseña</label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-field pr-10"
                  placeholder="Mínimo 8 caracteres"
                  aria-invalid={!!errors.password}
                  {...register('password', {
                    required: 'La contraseña es obligatoria',
                    minLength: { value: 8, message: 'Mínimo 8 caracteres' },
                  })}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="error-text">{errors.password.message}</p>}
            </div>

            <div className="mb-6">
              <label htmlFor="confirmPassword" className="label">Confirmar contraseña</label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className="input-field"
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword', {
                  required: 'Confirma la contraseña',
                  validate: (value) => value === password || 'Las contraseñas no coinciden',
                })}
              />
              {errors.confirmPassword && <p className="error-text">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600">
            ¿Ya tienes cuenta?{' '}
            <Link href="/auth/login" className="font-medium text-primary-500 hover:text-primary-600">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
