'use client';
import { useState, useEffect, useCallback } from 'react';
import type { StripeElementLocale } from '@stripe/stripe-js';
import { ShieldCheck } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { Elements } from '@stripe/react-stripe-js';
import { Booking, PaymentIntent } from '@/types';
import { bookingsApi, paymentsApi } from '@/lib/api';
import { getStripe } from '@/lib/stripe';
import CheckoutForm from '@/components/organisms/CheckoutForm';
import Spinner from '@/components/atoms/Spinner';

export default function PaymentPage() {
  const t = useTranslations('pago');
  const idioma = useLocale();

  // El tema vive como clase en <html>, lo pone el script del layout antes del
  // primer pintado. Se lee tras montar para no discrepar del servidor.
  const [oscuro, setOscuro] = useState(false);
  useEffect(() => {
    setOscuro(document.documentElement.classList.contains('dark'));
  }, []);
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
        if (status === 404) setError(t('noEncontrada'));
        else if (status === 403) setError(t('sinPermiso'));
        else if (status === 409) setError(apiMsg || t('pagoEnCurso'));
        else if (!err?.response) setError(t('sinServidor'));
        else
          setError(
            apiMsg || t('errorCodigo', { codigo: status ?? t('desconocido') }),
          );
      } finally {
        setIsLoading(false);
      }
    }
    if (bookingId) init();
  }, [bookingId, router, t]);

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
        <h1 className="text-2xl font-semibold text-principal">
          {t('errorIniciar')}
        </h1>
        {error && <p className="text-secundario">{error}</p>}
        <Link
          href={`/dashboard/bookings/${bookingId}`}
          className="inline-block text-primary-600 hover:text-primary-700 underline text-sm"
        >
          {t('volverDetalle')}
        </Link>
      </div>
    );
  }

  return (
    <main className="bg-fondo min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-principal mb-2">
          {t('titulo')}
        </h1>
        <p className="text-secundario mb-6">
          {t.rich('pagandoReserva', {
            titulo: booking.service.title,
            servicio: (texto) => <strong>{texto}</strong>,
          })}
        </p>
        {/* La retención es la mejor señal de confianza que tiene la
            plataforma, y no se estaba usando justo donde alguien decide si
            mete la tarjeta: la pantalla no decía que el dinero no se cobra
            todavía, ni qué pasa si la reserva se cancela. */}
        <div className="mb-4 rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20">
          <p className="flex items-center gap-2 text-sm font-medium text-principal">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('retencionTitulo')}
          </p>
          <p className="mt-1 text-sm text-secundario">
            {t('retencionTexto', { importe: booking.totalPrice })}
          </p>
          <p className="mt-1 text-sm text-secundario">
            {t('retencionCancelar')}
          </p>
        </div>

        <div className="bg-superficie rounded-lg shadow-card p-6">
          <Elements
            key={intent.clientSecret}
            stripe={getStripe()}
            options={{
              clientSecret: intent.clientSecret,
              // El formulario se quedaba siempre en claro, así que en tema
              // oscuro salía un bloque blanco en mitad de la tarjeta. Y en
              // castellano aunque la página estuviera en otro idioma: es un
              // iframe ajeno, hay que decirle las dos cosas.
              locale: idioma as StripeElementLocale,
              appearance: { theme: oscuro ? 'night' : 'stripe' },
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
