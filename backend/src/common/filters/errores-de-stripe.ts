import { HttpStatus } from '@nestjs/common';
import Stripe from 'stripe';

/** Stripe no contesta, o contesta que ahora no puede. */
export const CODIGO_PAGOS_NO_DISPONIBLES = 'pagos-no-disponibles';

/** El banco no acepta la tarjeta. */
export const CODIGO_TARJETA_RECHAZADA = 'tarjeta-rechazada';

/**
 * El pago ya no está como esta petición creía: lo movió otra, o el propio
 * Stripe al caducar la retención.
 */
export const CODIGO_PAGO_EN_OTRO_ESTADO = 'pago-en-otro-estado';

/** Los segundos que se le pide esperar a quien recibe el 503. */
export const ESPERA_SIN_PAGOS = 30;

/**
 * Los rechazos de Stripe que dicen «eso ya no se puede hacer con este pago».
 *
 * Solo estos. El resto de las peticiones que Stripe da por mal hechas son un
 * fallo de este código —un importe con decimales, un parámetro que no
 * existe— y tienen que seguir viéndose como lo que son.
 */
const YA_NO_ESTA_ASI = new Set([
  'payment_intent_unexpected_state',
  'charge_already_captured',
  'charge_already_refunded',
  'charge_expired_for_capture',
]);

export interface RespuestaDeStripe {
  estado: HttpStatus;
  codigo: string;
  mensaje: string;
  /** Segundos de Retry-After, cuando volver a intentarlo más tarde sirve. */
  reintentarEn?: number;
}

/**
 * Qué se le contesta a quien llama cuando lo que ha fallado es Stripe.
 *
 * Todo llegaba como un 500 genérico: completar una reserva con Stripe caído
 * decía «Error interno del servidor», que ni es verdad ni le dice al
 * profesional que basta con repetirlo en un minuto. Con cada caso en su
 * código, la interfaz puede decirlo en el idioma de quien mira.
 *
 * Nada se queda a medias por contestar así: el dinero se mueve antes que el
 * estado de la reserva, y si Stripe falla la transacción se deshace.
 *
 * Devuelve null con lo que no es de Stripe, y con lo que siéndolo es un
 * fallo nuestro.
 */
export function respuestaDeStripe(
  excepcion: unknown,
): RespuestaDeStripe | null {
  if (!(excepcion instanceof Stripe.errors.StripeError)) return null;

  if (excepcion instanceof Stripe.errors.StripeCardError) {
    return {
      estado: HttpStatus.PAYMENT_REQUIRED,
      codigo: CODIGO_TARJETA_RECHAZADA,
      mensaje: 'El banco no ha aceptado la tarjeta.',
    };
  }

  // Sin conexión, con Stripe caído o pidiendo que se llame más despacio. Y
  // también si rechaza nuestra clave: para quien llama es lo mismo, que
  // ahora no se puede cobrar, y como es un 5xx queda en el registro y en
  // Sentry con su causa.
  if (
    excepcion instanceof Stripe.errors.StripeConnectionError ||
    excepcion instanceof Stripe.errors.StripeAPIError ||
    excepcion instanceof Stripe.errors.StripeRateLimitError ||
    excepcion instanceof Stripe.errors.StripeAuthenticationError ||
    excepcion instanceof Stripe.errors.StripePermissionError
  ) {
    return {
      estado: HttpStatus.SERVICE_UNAVAILABLE,
      codigo: CODIGO_PAGOS_NO_DISPONIBLES,
      mensaje:
        'El servicio de pagos no responde: vuelve a intentarlo en unos minutos.',
      reintentarEn: ESPERA_SIN_PAGOS,
    };
  }

  if (
    excepcion instanceof Stripe.errors.StripeIdempotencyError ||
    (excepcion instanceof Stripe.errors.StripeInvalidRequestError &&
      excepcion.code !== undefined &&
      YA_NO_ESTA_ASI.has(excepcion.code))
  ) {
    return {
      estado: HttpStatus.CONFLICT,
      codigo: CODIGO_PAGO_EN_OTRO_ESTADO,
      mensaje:
        'El pago ha cambiado mientras tanto: recarga la página y vuelve a intentarlo.',
    };
  }

  return null;
}
