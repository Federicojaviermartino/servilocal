'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Calendar, MapPin, ArrowLeft } from 'lucide-react';
import { Booking, BookingStatus, UserRole } from '@/types';
import { bookingsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Badge from '@/components/atoms/Badge';
import Avatar from '@/components/atoms/Avatar';
import Button from '@/components/atoms/Button';
import Spinner from '@/components/atoms/Spinner';

const statusLabels: Record<BookingStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  [BookingStatus.PENDING]: { label: 'Pendiente', variant: 'warning' },
  [BookingStatus.CONFIRMED]: { label: 'Confirmada', variant: 'info' },
  [BookingStatus.COMPLETED]: { label: 'Completada', variant: 'success' },
  [BookingStatus.CANCELLED]: { label: 'Cancelada', variant: 'default' },
  [BookingStatus.REJECTED]: { label: 'Rechazada', variant: 'danger' },
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;
  const { user } = useAuthStore();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    bookingsApi
      .getById(bookingId)
      .then((res) => setBooking(res.data))
      .catch(() => setBooking(null))
      .finally(() => setIsLoading(false));
  }, [bookingId]);

  useEffect(() => {
    if (bookingId) load();
  }, [bookingId, load]);

  const changeStatus = async (status: BookingStatus) => {
    setIsUpdating(true);
    try {
      await bookingsApi.updateStatus(bookingId, status);
      toast.success('Reserva actualizada');
      load();
    } catch {
      toast.error('No se ha podido actualizar la reserva');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!booking || !user) {
    return (
      <div className="bg-white rounded-lg shadow-card p-10 text-center text-neutral-600">
        Reserva no encontrada.
      </div>
    );
  }

  const isClient = user.role === UserRole.CLIENT;
  const isProvider = user.role === UserRole.PROVIDER;
  const counterpart = isProvider ? booking.client : booking.provider;
  const backHref = isProvider ? '/dashboard/bookings-received' : '/dashboard/bookings';
  const statusCfg = statusLabels[booking.status];
  const date = new Date(booking.scheduledDate);

  const canClientPay = isClient && booking.status === BookingStatus.PENDING;
  const canProviderDecide = isProvider && booking.status === BookingStatus.PENDING;
  const canProviderComplete = isProvider && booking.status === BookingStatus.CONFIRMED;
  const canCancel =
    (booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED) &&
    (booking.clientId === user.id || booking.providerId === user.id);

  return (
    <div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-primary-600 mb-4"
      >
        <ArrowLeft size={16} />
        Volver
      </Link>

      <div className="bg-white rounded-lg shadow-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          <span className="text-xs text-neutral-500">#{booking.id.slice(0, 8)}</span>
        </div>

        <h1 className="text-2xl font-bold text-neutral-900 mb-4">
          {booking.service.title}
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-neutral-700 mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={16} />
            <span>
              {date.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}{' '}
              a las{' '}
              {date.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          {booking.service.city && (
            <div className="flex items-center gap-2">
              <MapPin size={16} />
              <span>{booking.service.city}</span>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-neutral-900 mb-2">
            Descripcion
          </h2>
          <p className="text-neutral-700 whitespace-pre-line">
            {booking.description || 'Sin descripcion.'}
          </p>
        </div>

        <div className="bg-neutral-50 rounded-md p-4 mb-6">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">
            {isProvider ? 'Cliente' : 'Profesional'}
          </h2>
          <div className="flex items-center gap-3">
            <Avatar name={`${counterpart.firstName} ${counterpart.lastName}`} size="md" />
            <div>
              <p className="font-medium text-neutral-900">
                {counterpart.firstName} {counterpart.lastName}
              </p>
              {counterpart.phone && (
                <p className="text-sm text-neutral-600">{counterpart.phone}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200 pt-4 mb-6">
          <span className="text-neutral-700">Importe</span>
          <span className="text-2xl font-bold text-neutral-900">
            {booking.totalPrice} euros
          </span>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {canClientPay && (
            <Button onClick={() => router.push(`/bookings/${booking.id}/payment`)}>
              Pagar ahora
            </Button>
          )}
          {canProviderDecide && (
            <>
              <Button
                variant="secondary"
                onClick={() => changeStatus(BookingStatus.REJECTED)}
                disabled={isUpdating}
              >
                Rechazar
              </Button>
              <Button
                onClick={() => changeStatus(BookingStatus.CONFIRMED)}
                disabled={isUpdating}
              >
                Confirmar
              </Button>
            </>
          )}
          {canProviderComplete && (
            <Button
              onClick={() => changeStatus(BookingStatus.COMPLETED)}
              disabled={isUpdating}
            >
              Marcar como completada
            </Button>
          )}
          {canCancel && (
            <Button
              variant="secondary"
              onClick={() => changeStatus(BookingStatus.CANCELLED)}
              disabled={isUpdating}
            >
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
