'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Elements } from '@stripe/react-stripe-js';
import { Booking, PaymentIntent } from '@/types';
import { bookingsApi, paymentsApi } from '@/lib/api';
import { getStripe } from '@/lib/stripe';
import CheckoutForm from '@/components/organisms/CheckoutForm';
import Spinner from '@/components/atoms/Spinner';

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshIntent = useCallback(async () => {
    const { data: i } = await paymentsApi.createIntent(bookingId);
    setIntent(i);
  }, [bookingId]);

  useEffect(() => {
    async function init() {
      try {
        const { data: b } = await bookingsApi.getById(bookingId);
        setBooking(b);
        const { data: i } = await paymentsApi.createIntent(bookingId);
        setIntent(i);
      } catch (err: any) {
        const status = err?.response?.status;
        const apiMsg = err?.response?.data?.message;
        if (status === 404) setError('Reserva no encontrada.');
        else if (status === 403) setError('No tienes permiso para pagar esta reserva.');
        else if (status === 409) setError(apiMsg || 'Esta reserva ya tiene un pago en curso o completado.');
        else if (!err?.response) setError('No se pudo contactar con el servidor.');
        else setError(apiMsg || `No se ha podido iniciar el pago (codigo ${status ?? 'desconocido'}).`);
      } finally {
        setIsLoading(false);
      }
    }
    if (bookingId) init();
  }, [bookingId, router]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !booking || !intent) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-neutral-900">
          No se ha podido iniciar el pago
        </h1>
        {error && <p className="text-neutral-700">{error}</p>}
        <Link
          href={`/dashboard/bookings/${bookingId}`}
          className="inline-block text-primary-600 hover:text-primary-700 underline text-sm"
        >
          Volver al detalle de la reserva
        </Link>
      </div>
    );
  }

  return (
    <main className="bg-neutral-50 min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">
          Confirmar pago
        </h1>
        <p className="text-neutral-600 mb-6">
          Estas pagando la reserva de <strong>{booking.service.title}</strong>
        </p>
        <div className="bg-white rounded-lg shadow-card p-6">
          <Elements
            key={intent.clientSecret}
            stripe={getStripe()}
            options={{
              clientSecret: intent.clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <CheckoutForm
              bookingId={bookingId}
              paymentIntentId={intent.paymentIntentId}
              amount={booking.totalPrice}
              onIntentExpired={refreshIntent}
            />
          </Elements>
        </div>
      </div>
    </main>
  );
}
