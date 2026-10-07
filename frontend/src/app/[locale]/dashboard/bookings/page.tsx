'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Booking } from '@/types';
import { bookingsApi } from '@/lib/api';
import BookingCard from '@/components/molecules/BookingCard';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import FiltroEstados, {
  type FiltroDeEstado,
} from '@/components/molecules/FiltroEstados';
import { useCarga } from '@/lib/carga';

export default function MyBookingsPage() {
  const t = useTranslations('reservasPanel');
  const [filter, setFilter] = useState<FiltroDeEstado>('all');

  // Antes un fallo de red dejaba la lista vacía, indistinguible de no tener
  // ninguna reserva: quien reservó ayer entraba hoy y leía «no tienes
  // reservas».
  const { datos, estado, reintentar, referencia } = useCarga<Booking[]>(
    () => bookingsApi.getMyBookings(),
    [],
  );
  const bookings = datos ?? [];

  const filtered =
    filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  return (
    <div>
      <h1 className="text-2xl font-bold text-principal mb-6">
        {t('misReservas')}
      </h1>

      <FiltroEstados valor={filter} onCambiar={setFilter} reservas={bookings} />

      <EstadoCarga
        estado={estado}
        onReintentar={reintentar}
        referencia={referencia}
      >
        {filtered.length === 0 ? (
          <div className="bg-superficie rounded-lg shadow-card p-10 text-center text-secundario">
            {t('sinReservas')}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => (
              <BookingCard key={b.id} booking={b} viewAs="client" />
            ))}
          </div>
        )}
      </EstadoCarga>
    </div>
  );
}
