/**
 * Nivel atomico: Molecula
 * Componente: BookingCard (tarjeta de reserva)
 */
'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Calendar, MapPin } from 'lucide-react';
import { Booking } from '@/types';
import { CLAVE_ESTADO, VARIANTE_ESTADO } from '@/lib/estados';
import Badge from '../atoms/Badge';
import Avatar from '../atoms/Avatar';

interface BookingCardProps {
  booking: Booking;
  viewAs: 'client' | 'provider';
}

export default function BookingCard({ booking, viewAs }: BookingCardProps) {
  const t = useTranslations('estados');
  const tReservas = useTranslations('reservasPanel');
  const idioma = useLocale();
  const counterpart = viewAs === 'client' ? booking.provider : booking.client;
  const date = new Date(booking.scheduledDate);

  return (
    <Link
      href={`/dashboard/bookings/${booking.id}`}
      className="block bg-superficie rounded-lg shadow-card hover:shadow-card-hover transition-shadow p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={VARIANTE_ESTADO[booking.status]}>
              {t(CLAVE_ESTADO[booking.status])}
            </Badge>
            <span className="text-xs text-tenue">
              #{booking.id.slice(0, 8)}
            </span>
          </div>
          <h3 className="font-semibold text-principal truncate">
            {booking.service.title}
          </h3>
          <div className="mt-2 flex items-center gap-3 text-sm text-secundario">
            <div className="flex items-center gap-1">
              <Calendar size={14} />
              <span>
                {date.toLocaleDateString(idioma, {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                {date.toLocaleTimeString(idioma, {
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
            <span className="text-secundario">
              {counterpart.firstName} {counterpart.lastName}
            </span>
          </div>
        </div>
        <div className="text-end">
          <p className="text-lg font-bold text-principal">
            {tReservas('importeEnEuros', { importe: booking.totalPrice })}
          </p>
        </div>
      </div>
    </Link>
  );
}
