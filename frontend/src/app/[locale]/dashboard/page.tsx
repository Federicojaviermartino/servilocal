'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { Booking, BookingStatus, UserRole } from '@/types';
import { bookingsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useCarga } from '@/lib/carga';

export default function DashboardHomePage() {
  const t = useTranslations('panel');
  const tEstados = useTranslations('estados');
  const tReservas = useTranslations('reservasPanel');
  const { user } = useAuthStore();
  const router = useRouter();
  useEffect(() => {
    if (user?.role === UserRole.ADMIN) {
      router.replace('/admin');
    }
  }, [user, router]);

  // Los contadores del resumen salen de aquí. Con la lista vacía por un
  // fallo de red enseñaban tres ceros, que es una afirmación, no un hueco.
  const { datos, estado, reintentar } = useCarga<Booking[]>(
    () =>
      user?.role === UserRole.PROVIDER
        ? bookingsApi.getReceived()
        : bookingsApi.getMyBookings(),
    [user?.id, user?.role],
  );
  const bookings = datos ?? [];

  if (!user || user.role === UserRole.ADMIN) return null;

  const pending = bookings.filter(
    (b) => b.status === BookingStatus.PENDING,
  ).length;
  const confirmed = bookings.filter(
    (b) => b.status === BookingStatus.CONFIRMED,
  ).length;
  const completed = bookings.filter(
    (b) => b.status === BookingStatus.COMPLETED,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-principal">
          {t('hola', { nombre: user.firstName })}
        </h1>
        <p className="text-secundario mt-1">
          {user.role === UserRole.PROVIDER
            ? t('resumenProfesional')
            : t('resumenCliente')}
        </p>
      </div>

      <EstadoCarga estado={estado} onReintentar={reintentar}>
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-superficie rounded-lg shadow-card p-5">
              <p className="text-sm text-secundario">
                {tEstados('pendientes')}
              </p>
              <p className="text-3xl font-bold text-warning-600 mt-1">
                {pending}
              </p>
            </div>
            <div className="bg-superficie rounded-lg shadow-card p-5">
              <p className="text-sm text-secundario">
                {tEstados('confirmadas')}
              </p>
              <p className="text-3xl font-bold text-primary-600 mt-1">
                {confirmed}
              </p>
            </div>
            <div className="bg-superficie rounded-lg shadow-card p-5">
              <p className="text-sm text-secundario">
                {tEstados('completadas')}
              </p>
              <p className="text-3xl font-bold text-success-600 mt-1">
                {completed}
              </p>
            </div>
          </div>

          <div className="bg-superficie rounded-lg shadow-card p-6">
            <h2 className="text-lg font-semibold text-principal mb-4">
              {t('accesosRapidos')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {user.role === UserRole.PROVIDER ? (
                <>
                  <Link
                    href="/dashboard/services"
                    className="block p-4 rounded-md border border-borde hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <p className="font-medium text-principal">
                      {t('gestionarServicios')}
                    </p>
                    <p className="text-sm text-secundario mt-1">
                      {t('gestionarServiciosTexto')}
                    </p>
                  </Link>
                  <Link
                    href="/dashboard/bookings-received"
                    className="block p-4 rounded-md border border-borde hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <p className="font-medium text-principal">
                      {tReservas('reservasRecibidas')}
                    </p>
                    <p className="text-sm text-secundario mt-1">
                      {t('reservasRecibidasTexto')}
                    </p>
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/services/search"
                    className="block p-4 rounded-md border border-borde hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <p className="font-medium text-principal">
                      {t('buscarServicio')}
                    </p>
                    <p className="text-sm text-secundario mt-1">
                      {t('buscarServicioTexto')}
                    </p>
                  </Link>
                  <Link
                    href="/dashboard/bookings"
                    className="block p-4 rounded-md border border-borde hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <p className="font-medium text-principal">
                      {t('verReservas')}
                    </p>
                    <p className="text-sm text-secundario mt-1">
                      {t('verReservasTexto')}
                    </p>
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      </EstadoCarga>
    </div>
  );
}
