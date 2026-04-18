'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

  useEffect(() => {
    async function init() {
      try {
        const { data: b } = await bookingsApi.getById(bookingId);
        setBooking(b);
        const { data: i } = await paymentsApi.createIntent(bookingId);
        setIntent(i);
      } catch {
        router.push('/dashboard/bookings');
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

  if (!booking || !intent) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">
          No se ha podido iniciar el pago
        </h1>
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
            />
          </Elements>
        </div>
      </div>
    </main>
  );
}
