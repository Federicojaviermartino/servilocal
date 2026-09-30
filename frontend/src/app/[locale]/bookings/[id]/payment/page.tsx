'use client';
import { useState, useEffect, useCallback } from 'react';
import type { StripeElementLocale } from '@stripe/stripe-js';
import type { Idioma } from '@/i18n/routing';
import { ShieldCheck } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { Elements } from '@stripe/react-stripe-js';
import { Booking, BookingStatus, PaymentIntent } from '@/types';
import { bookingsApi, paymentsApi } from '@/lib/api';
import { getStripe } from '@/lib/stripe';
import {
  CODIGO_SESION_CADUCADA,
  codigoDeError,
  textoDeError,
} from '@/lib/errores-api';
import { formatearImporte } from '@/lib/importes';
import { useTemaOscuro } from '@/lib/tema';
import CheckoutForm from '@/components/organisms/CheckoutForm';
import Spinner from '@/components/atoms/Spinner';

/**
 * El idioma del formulario de Stripe, que es un iframe ajeno. No tiene
 * catalán, gallego ni euskera: sin decirle nada, elegía él, y en el
 * castellano se entiende quien lee cualquiera de los tres.
 */
const LOCALE_STRIPE: Record<Idioma, StripeElementLocale> = {
  es: 'es',
  en: 'en',
  ca: 'es',
  gl: 'es',
  eu: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'pt',
  ar: 'ar',
};

export default function PaymentPage() {
  const t = useTranslations('pago');
  const tErrores = useTranslations('erroresApi');
  const tCarga = useTranslations('carga');
  const idioma = useLocale();

  // Stripe pinta sus campos con el tema de la página. Ver lib/tema.ts.
  const oscuro = useTemaOscuro() ?? false;
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinSesion, setSinSesion] = useState(false);

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
        // Nunca el mensaje de la API: está en castellano. El código dice qué
        // pasó, en el idioma de quien paga.
        if (!err?.response) setError(t('sinServidor'));
        else if (status === 404) setError(t('noEncontrada'));
        else if (status === 403) setError(t('sinPermiso'));
        else
          setError(
            textoDeError(
              err,
              tErrores,
              status === 409
                ? t('pagoEnCurso')
                : t('errorCodigo', { codigo: status }),
            ),
          );
        setSinSesion(codigoDeError(err) === CODIGO_SESION_CADUCADA);
      } finally {
        setIsLoading(false);
      }
    }
    if (bookingId) init();
  }, [bookingId, router, t, tErrores]);

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
        {sinSesion ? (
          <Link
            href={{
              pathname: '/auth/login',
              query: { redirect: `/bookings/${bookingId}/payment` },
            }}
            className="inline-block text-acento underline text-sm"
          >
            {tCarga('entrarDeNuevo')}
          </Link>
        ) : (
          <Link
            href={`/dashboard/bookings/${bookingId}`}
            className="inline-block text-acento underline text-sm"
          >
            {t('volverDetalle')}
          </Link>
        )}
      </div>
    );
  }

  // Una completada sin cobro no se retiene: el trabajo ya está hecho, así
  // que se cobra en el acto y no hay nada que liberar si se cancela.
  const cobroInmediato = booking.status === BookingStatus.COMPLETED;

  return (
    <div className="bg-fondo min-h-screen py-8">
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
            {t(cobroInmediato ? 'cobroTitulo' : 'retencionTitulo')}
          </p>
          <p className="mt-1 text-sm text-secundario">
            {t(cobroInmediato ? 'cobroTexto' : 'retencionTexto', {
              importe: formatearImporte(booking.totalPrice, idioma, true),
            })}
          </p>
          {!cobroInmediato && (
            <p className="mt-1 text-sm text-secundario">
              {t('retencionCancelar')}
            </p>
          )}
          {/* La tarjeta se guarda en Stripe para renovar la retención, y la
              pantalla no lo decía. Un cobro en el acto no la guarda. */}
          {!cobroInmediato && (
            <p className="mt-1 text-sm text-secundario">
              {t('tarjetaGuardada')}
            </p>
          )}
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
              locale: LOCALE_STRIPE[idioma as Idioma] ?? 'auto',
              appearance: { theme: oscuro ? 'night' : 'stripe' },
            }}
          >
            <CheckoutForm
              bookingId={bookingId}
              paymentIntentId={intent.paymentIntentId}
              amount={booking.totalPrice}
              estadoReserva={booking.status}
              onIntentExpired={refreshIntent}
            />
          </Elements>
        </div>
      </div>
    </div>
  );
}
