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
}

export default function CheckoutForm({
  bookingId,
  paymentIntentId,
  amount,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      toast.error(error.message || 'Error procesando el pago');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
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
        disabled={!stripe || isProcessing}
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
