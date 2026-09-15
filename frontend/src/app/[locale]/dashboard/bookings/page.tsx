'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Booking, BookingStatus } from '@/types';
import { bookingsApi } from '@/lib/api';
import BookingCard from '@/components/molecules/BookingCard';
import Spinner from '@/components/atoms/Spinner';

export default function MyBookingsPage() {
  const t = useTranslations('reservasPanel');
  const tEstados = useTranslations('estados');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');

  useEffect(() => {
    bookingsApi
      .getMyBookings()
      .then((res) => setBookings(res.data || []))
      .catch(() => setBookings([]))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered =
    filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const tabs: { id: 'all' | BookingStatus; label: string }[] = [
    { id: 'all', label: tEstados('todas') },
    { id: BookingStatus.PENDING, label: tEstados('pendientes') },
    { id: BookingStatus.CONFIRMED, label: tEstados('confirmadas') },
    { id: BookingStatus.COMPLETED, label: tEstados('completadas') },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-principal mb-6">
        {t('misReservas')}
      </h1>

      <div className="bg-superficie rounded-lg shadow-card p-1 mb-4 inline-flex max-w-full flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              filter === t.id
                ? 'bg-primary-600 text-white'
                : 'text-secundario hover:bg-fondo'
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
    </div>
  );
}
