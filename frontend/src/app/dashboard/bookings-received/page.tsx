'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Booking, BookingStatus } from '@/types';
import { bookingsApi } from '@/lib/api';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';
import Avatar from '@/components/atoms/Avatar';
import Spinner from '@/components/atoms/Spinner';

const statusLabels: Record<BookingStatus, string> = {
  [BookingStatus.PENDING]: 'Pendiente',
  [BookingStatus.CONFIRMED]: 'Confirmada',
  [BookingStatus.COMPLETED]: 'Completada',
  [BookingStatus.CANCELLED]: 'Cancelada',
  [BookingStatus.REJECTED]: 'Rechazada',
};

const statusVariants: Record<
  BookingStatus,
  'default' | 'success' | 'warning' | 'danger' | 'info'
> = {
  [BookingStatus.PENDING]: 'warning',
  [BookingStatus.CONFIRMED]: 'info',
  [BookingStatus.COMPLETED]: 'success',
  [BookingStatus.CANCELLED]: 'default',
  [BookingStatus.REJECTED]: 'danger',
};

export default function BookingsReceivedPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');

  const load = async () => {
    setIsLoading(true);
    try {
      const { data } = await bookingsApi.getReceived();
      setBookings(data || []);
    } catch {
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleStatusChange = async (id: string, status: BookingStatus) => {
    try {
      await bookingsApi.updateStatus(id, status);
      toast.success(`Reserva ${statusLabels[status].toLowerCase()}`);
      load();
    } catch {
      toast.error('No se ha podido actualizar la reserva');
    }
  };

  const filtered =
    filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const tabs: { id: 'all' | BookingStatus; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: BookingStatus.PENDING, label: 'Pendientes' },
    { id: BookingStatus.CONFIRMED, label: 'Confirmadas' },
    { id: BookingStatus.COMPLETED, label: 'Completadas' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">
        Reservas recibidas
      </h1>

      <div className="bg-white rounded-lg shadow-card p-1 mb-4 inline-flex">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-4 py-2 text-sm rounded-md ${
              filter === t.id
                ? 'bg-primary-600 text-white'
                : 'text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow-card p-10 text-center text-neutral-600">
          No tienes reservas en esta seccion.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const date = new Date(b.scheduledDate);
            return (
              <div
                key={b.id}
                className="bg-white rounded-lg shadow-card p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={statusVariants[b.status]}>
                        {statusLabels[b.status]}
                      </Badge>
                      <span className="text-xs text-neutral-500">
                        #{b.id.slice(0, 8)}
                      </span>
                    </div>
                    <h3 className="font-semibold text-neutral-900">
                      {b.service.title}
                    </h3>
                    <p className="text-sm text-neutral-600 mt-1">
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
                    </p>
                    {b.description && (
                      <p className="mt-2 text-sm text-neutral-700 bg-neutral-50 rounded p-2">
                        {b.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Avatar
                        name={`${b.client.firstName} ${b.client.lastName}`}
                        size="sm"
                      />
                      <span className="text-sm text-neutral-700">
                        {b.client.firstName} {b.client.lastName}
                      </span>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-neutral-900 whitespace-nowrap">
                    {b.totalPrice} euros
                  </p>
                </div>

                {b.status === BookingStatus.PENDING && (
                  <div className="mt-4 pt-4 border-t border-neutral-100 flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleStatusChange(b.id, BookingStatus.REJECTED)
                      }
                    >
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleStatusChange(b.id, BookingStatus.CONFIRMED)
                      }
                    >
                      Aceptar reserva
                    </Button>
                  </div>
                )}
                {b.status === BookingStatus.CONFIRMED && (
                  <div className="mt-4 pt-4 border-t border-neutral-100 flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        handleStatusChange(b.id, BookingStatus.COMPLETED)
                      }
                    >
                      Marcar como completada
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
