import { HttpStatus } from '@nestjs/common';
import Stripe from 'stripe';
import {
  CODIGO_PAGO_EN_OTRO_ESTADO,
  CODIGO_PAGOS_NO_DISPONIBLES,
  CODIGO_TARJETA_RECHAZADA,
  ESPERA_SIN_PAGOS,
  respuestaDeStripe,
} from './errores-de-stripe';

const { errors } = Stripe;

/** Un error de Stripe como los construye su librería. */
const crudo = (codigo?: string) => ({
  type: 'invalid_request_error' as const,
  message: 'Lo que diga Stripe, que no sale de aquí',
  ...(codigo && { code: codigo }),
});

describe('respuestaDeStripe', () => {
  it.each([
    ['sin conexión', new errors.StripeConnectionError(crudo())],
    ['con Stripe caído', new errors.StripeAPIError(crudo())],
    ['pidiendo ir más despacio', new errors.StripeRateLimitError(crudo())],
    ['rechazando la clave', new errors.StripeAuthenticationError(crudo())],
    ['sin permiso para eso', new errors.StripePermissionError(crudo())],
  ])('%s, ahora no se puede cobrar: 503 y cuándo volver', (_caso, error) => {
    expect(respuestaDeStripe(error)).toEqual({
      estado: HttpStatus.SERVICE_UNAVAILABLE,
      codigo: CODIGO_PAGOS_NO_DISPONIBLES,
      mensaje: expect.stringContaining('vuelve a intentarlo'),
      reintentarEn: ESPERA_SIN_PAGOS,
    });
  });

  it('una tarjeta rechazada es cosa del banco: 402, y reintentar igual no sirve', () => {
    const respuesta = respuestaDeStripe(
      new errors.StripeCardError(crudo('card_declined')),
    );

    expect(respuesta).toMatchObject({
      estado: HttpStatus.PAYMENT_REQUIRED,
      codigo: CODIGO_TARJETA_RECHAZADA,
    });
    expect(respuesta?.reintentarEn).toBeUndefined();
  });

  it.each([
    'payment_intent_unexpected_state',
    'charge_already_captured',
    'charge_already_refunded',
    'charge_expired_for_capture',
  ])('«%s» es que el pago ya no está así: 409', (codigo) => {
    expect(
      respuestaDeStripe(new errors.StripeInvalidRequestError(crudo(codigo))),
    ).toMatchObject({
      estado: HttpStatus.CONFLICT,
      codigo: CODIGO_PAGO_EN_OTRO_ESTADO,
    });
  });

  it('la misma clave de idempotencia con otra petición, también', () => {
    expect(
      respuestaDeStripe(new errors.StripeIdempotencyError(crudo())),
    ).toMatchObject({ estado: HttpStatus.CONFLICT });
  });

  it.each([
    ['con otro código', crudo('parameter_invalid_integer')],
    ['sin código', crudo()],
  ])(
    'una petición que Stripe da por mal hecha, %s, es un fallo nuestro y no se disfraza',
    (_caso, datos) => {
      // Un importe con decimales o un parámetro que no existe tienen que
      // seguir llegando como un 500, con su traza: taparlos con un 409 los
      // escondería del registro.
      expect(
        respuestaDeStripe(new errors.StripeInvalidRequestError(datos)),
      ).toBeNull();
    },
  );

  it('lo que no es de ninguna de esas clases tampoco', () => {
    expect(respuestaDeStripe(new errors.StripeError(crudo()))).toBeNull();
  });

  it.each([[new Error('otra cosa')], ['un texto'], [null], [undefined]])(
    'lo que no viene de Stripe no es asunto suyo: %s',
    (excepcion) => {
      expect(respuestaDeStripe(excepcion)).toBeNull();
    },
  );
});
