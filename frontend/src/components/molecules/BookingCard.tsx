/**
 * Nivel atomico: Molecula
 * Componente: BookingCard (tarjeta de reserva)
 */
import Link from 'next/link';
import { Calendar, MapPin } from 'lucide-react';
import { Booking, BookingStatus } from '@/types';
import Badge from '../atoms/Badge';
import Avatar from '../atoms/Avatar';

interface BookingCardProps {
  booking: Booking;
  viewAs: 'client' | 'provider';
}

const statusConfig: Record<
  BookingStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  [BookingStatus.PENDING]: { label: 'Pendiente', variant: 'warning' },
  [BookingStatus.CONFIRMED]: { label: 'Confirmada', variant: 'info' },
  [BookingStatus.COMPLETED]: { label: 'Completada', variant: 'success' },
  [BookingStatus.CANCELLED]: { label: 'Cancelada', variant: 'default' },
  [BookingStatus.REJECTED]: { label: 'Rechazada', variant: 'danger' },
};

export default function BookingCard({ booking, viewAs }: BookingCardProps) {
  const status = statusConfig[booking.status];
  const counterpart = viewAs === 'client' ? booking.provider : booking.client;
  const date = new Date(booking.scheduledDate);

  return (
    <Link
      href={`/dashboard/bookings/${booking.id}`}
      className="block bg-white rounded-lg shadow-card hover:shadow-card-hover transition-shadow p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-xs text-neutral-500">
              #{booking.id.slice(0, 8)}
            </span>
          </div>
          <h3 className="font-semibold text-neutral-900 truncate">
            {booking.service.title}
          </h3>
          <div className="mt-2 flex items-center gap-3 text-sm text-neutral-600">
            <div className="flex items-center gap-1">
              <Calendar size={14} />
              <span>
                {date.toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                {date.toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {booking.service.city && (
              <div className="flex items-center gap-1">
                <MapPin size={14} />
                <span>{booking.service.city}</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Avatar
              name={`${counterpart.firstName} ${counterpart.lastName}`}
              size="sm"
            />
            <span className="text-neutral-700">
              {counterpart.firstName} {counterpart.lastName}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-neutral-900">
            {booking.totalPrice} euros
          </p>
        </div>
      </div>
    </Link>
  );
}
