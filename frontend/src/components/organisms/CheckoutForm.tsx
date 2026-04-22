/**
 * Nivel atomico: Organismo
 * Componente: CheckoutForm (Stripe Elements)
 */
'use client';
import { useState, FormEvent } from 'react';
import {
  useStripe,
  useElements,
  PaymentElement,
} from '@stripe/react-stripe-js';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { paymentsApi } from '@/lib/api';
import Button from '../atoms/Button';

interface CheckoutFormProps {
  bookingId: string;
  paymentIntentId: string;
  amount: number;
  onIntentExpired?: () => Promise<void>;
}

const stripeErrorMessages: Record<string, string> = {
  payment_intent_unexpected_state:
    'La sesion de pago ha caducado. Generando una nueva...',
  card_declined: 'Tu tarjeta ha sido rechazada.',
  authentication_required:
    'Se requiere verificacion adicional de tu banco.',
  processing_error:
    'Error temporal procesando el pago. Intentalo de nuevo.',
  expired_card: 'Tu tarjeta ha caducado.',
  incorrect_cvc: 'El CVC introducido no es correcto.',
  insufficient_funds: 'Fondos insuficientes en la tarjeta.',
};

function translateStripeError(code?: string, fallback?: string): string {
  if (code && stripeErrorMessages[code]) return stripeErrorMessages[code];
  return fallback || 'Error procesando el pago.';
}

export default function CheckoutForm({
  bookingId,
  paymentIntentId,
  amount,
  onIntentExpired,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isProcessing) return;
    if (!stripe || !elements) {
      toast.error('El formulario de pago aun se esta cargando. Espera un momento.');
      return;
    }

    setIsProcessing(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      if (error.code === 'payment_intent_unexpected_state' && onIntentExpired) {
        toast(translateStripeError('payment_intent_unexpected_state'));
        try {
          await onIntentExpired();
        } catch {
          toast.error('No se pudo regenerar la sesion de pago. Recarga la pagina.');
        }
        setIsProcessing(false);
        return;
      }
      toast.error(translateStripeError(error.code, error.message));
      setIsProcessing(false);
      return;
    }

    if (
      paymentIntent?.status === 'succeeded' ||
      paymentIntent?.status === 'requires_capture'
    ) {
      try {
        await paymentsApi.confirm(paymentIntentId);
        toast.success('Pago completado. Reserva confirmada.');
        router.push(`/dashboard/bookings?confirmed=${bookingId}`);
      } catch {
        toast.error('Pago recibido pero no confirmado. Contacta con soporte.');
      }
    }
    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <div className="bg-neutral-50 rounded-md p-4 flex justify-between items-center">
        <span className="text-neutral-700">Total a pagar</span>
        <span className="text-xl font-bold text-neutral-900">
          {amount.toFixed(2)} euros
        </span>
      </div>
      <Button
        type="submit"
        fullWidth
        size="lg"
        disabled={!stripe || !elements || isProcessing}
        isLoading={isProcessing}
      >
        Pagar {amount.toFixed(2)} euros
      </Button>
      <p className="text-xs text-neutral-500 text-center">
        Pago procesado de forma segura por Stripe. ServiLocal no almacena los
        datos de tu tarjeta.
      </p>
    </form>
  );
}
