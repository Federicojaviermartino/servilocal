import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Si los pagos son de prueba: lo dice la propia clave publicable.
 *
 * La demostración cobra contra Stripe en modo de prueba, y quien llega al
 * formulario de pago no tenía cómo saber que la tarjeta que vale es la
 * 4242 4242 4242 4242: solo lo contaba el README.
 */
export const PAGOS_DE_PRUEBA = (
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
).startsWith('pk_test_');

export function getStripe() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
