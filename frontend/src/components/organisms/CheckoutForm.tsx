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
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import toast from 'react-hot-toast';
import { paymentsApi } from '@/lib/api';
import Button from '../atoms/Button';

interface CheckoutFormProps {
  bookingId: string;
  paymentIntentId: string;
  amount: number;
  onIntentExpired?: () => Promise<void>;
}

// Stripe devuelve el motivo en inglés y con jerga de pasarela. Estos son los
// códigos que un usuario puede provocar de verdad al pagar.
const CLAVES_STRIPE = {
  payment_intent_unexpected_state: 'caducada',
  card_declined: 'rechazada',
  authentication_required: 'verificacion',
  processing_error: 'errorTemporal',
  expired_card: 'tarjetaCaducada',
  incorrect_cvc: 'cvcIncorrecto',
  insufficient_funds: 'fondosInsuficientes',
} as const;

export default function CheckoutForm({
  bookingId,
  paymentIntentId,
  amount,
  onIntentExpired,
}: CheckoutFormProps) {
  const t = useTranslations('pago');
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [isProcessing, setIsProcessing] = useState(false);

  const mensajeStripe = (codigo?: string, alternativa?: string): string => {
    const clave = codigo && CLAVES_STRIPE[codigo as keyof typeof CLAVES_STRIPE];
    if (clave) return t(clave);
    return alternativa || t('errorGenerico');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isProcessing) return;
    if (!stripe || !elements) {
      toast.error(t('formularioCargando'));
      return;
    }

    setIsProcessing(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      if (error.code === 'payment_intent_unexpected_state' && onIntentExpired) {
        toast(t('caducada'));
        try {
          await onIntentExpired();
        } catch {
          toast.error(t('noRegenerar'));
        }
        setIsProcessing(false);
        return;
      }
      toast.error(mensajeStripe(error.code, error.message));
      setIsProcessing(false);
      return;
    }

    if (
      paymentIntent?.status === 'succeeded' ||
      paymentIntent?.status === 'requires_capture'
    ) {
      try {
        await paymentsApi.confirm(paymentIntentId);
        toast.success(t('completado'));
        router.push(`/dashboard/bookings?confirmed=${bookingId}`);
      } catch {
        toast.error(t('noConfirmado'));
      }
    }
    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <div className="bg-fondo rounded-md p-4 flex justify-between items-center">
        <span className="text-secundario">{t('totalPagar')}</span>
        <span className="text-xl font-bold text-principal">
          {t('importe', { importe: amount.toFixed(2) })}
        </span>
      </div>
      <Button
        type="submit"
        fullWidth
        size="lg"
        disabled={!stripe || !elements || isProcessing}
        isLoading={isProcessing}
      >
        {t('pagar', { importe: amount.toFixed(2) })}
      </Button>
      <p className="text-xs text-tenue text-center">{t('avisoStripe')}</p>
    </form>
  );
}
