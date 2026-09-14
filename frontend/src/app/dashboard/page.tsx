'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Booking, BookingStatus, UserRole } from '@/types';
import { bookingsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Spinner from '@/components/atoms/Spinner';

export default function DashboardHomePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.role === UserRole.ADMIN) {
      router.replace('/admin');
    }
  }, [user, router]);

  useEffect(() => {
    if (!user || user.role === UserRole.ADMIN) return;
    const fetcher =
      user.role === UserRole.PROVIDER
        ? bookingsApi.getReceived
        : bookingsApi.getMyBookings;
    fetcher()
      .then((res) => setBookings(res.data || []))
      .catch(() => setBookings([]))
      .finally(() => setIsLoading(false));
  }, [user]);

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
          Hola, {user.firstName}
        </h1>
        <p className="text-secundario mt-1">
          {user.role === UserRole.PROVIDER
            ? 'Aquí tienes el resumen de tu actividad como profesional.'
            : 'Aquí tienes el resumen de tus reservas y valoraciones.'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-superficie rounded-lg shadow-card p-5">
              <p className="text-sm text-secundario">Pendientes</p>
              <p className="text-3xl font-bold text-warning-600 mt-1">
                {pending}
              </p>
            </div>
            <div className="bg-superficie rounded-lg shadow-card p-5">
              <p className="text-sm text-secundario">Confirmadas</p>
              <p className="text-3xl font-bold text-primary-600 mt-1">
                {confirmed}
              </p>
            </div>
            <div className="bg-superficie rounded-lg shadow-card p-5">
              <p className="text-sm text-secundario">Completadas</p>
              <p className="text-3xl font-bold text-success-600 mt-1">
                {completed}
              </p>
            </div>
          </div>

          <div className="bg-superficie rounded-lg shadow-card p-6">
            <h2 className="text-lg font-semibold text-principal mb-4">
              Accesos rápidos
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {user.role === UserRole.PROVIDER ? (
                <>
                  <Link
                    href="/dashboard/services"
                    className="block p-4 rounded-md border border-borde hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <p className="font-medium text-principal">
                      Gestionar mis servicios
                    </p>
                    <p className="text-sm text-secundario mt-1">
                      Crea, edita o pausa tus servicios publicados.
                    </p>
                  </Link>
                  <Link
                    href="/dashboard/bookings-received"
                    className="block p-4 rounded-md border border-borde hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <p className="font-medium text-principal">
                      Reservas recibidas
                    </p>
                    <p className="text-sm text-secundario mt-1">
                      Acepta, rechaza o marca trabajos como completados.
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
                      Buscar un servicio
                    </p>
                    <p className="text-sm text-secundario mt-1">
                      Encuentra profesionales cerca de ti.
                    </p>
                  </Link>
                  <Link
                    href="/dashboard/bookings"
                    className="block p-4 rounded-md border border-borde hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                  >
                    <p className="font-medium text-principal">
                      Ver mis reservas
                    </p>
                    <p className="text-sm text-secundario mt-1">
                      Consulta el estado de tus reservas en curso.
                    </p>
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
