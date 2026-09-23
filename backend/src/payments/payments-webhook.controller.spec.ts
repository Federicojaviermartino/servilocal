import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentsWebhookController } from './payments-webhook.controller';

const FIRMA = 't=123,v1=abc';
const CUERPO = Buffer.from('{"type":"payment_intent.succeeded"}');

/**
 * La verificación de firma del webhook de Stripe.
 *
 * Es la única puerta del sistema que mueve dinero sin que haya una sesión
 * detrás: cualquiera puede llamarla. Lo único que separa un aviso legítimo de
 * uno inventado es esta comprobación, y hasta ahora no la miraba ninguna
 * prueba —ni siquiera contaba para la cobertura, porque el recuento solo
 * incluía los servicios.
 */
async function construir(
  opciones: { secreto?: string; firmaValida?: boolean } = {},
) {
  const pagos = { handleWebhookEvent: vi.fn(async () => undefined) };

  const module: TestingModule = await Test.createTestingModule({
    controllers: [PaymentsWebhookController],
    providers: [
      { provide: PaymentsService, useValue: pagos },
      {
        provide: ConfigService,
        useValue: {
          getOrThrow: () => 'sk_test_x',
          get: () =>
            'secreto' in opciones ? opciones.secreto : 'whsec_de_prueba',
        },
      },
    ],
  }).compile();

  const controlador = module.get(PaymentsWebhookController);

  const constructEvent = vi.fn((cuerpo: Buffer) => {
    if (opciones.firmaValida === false) {
      throw new Error('No signatures found matching the expected signature');
    }
    return { id: 'evt_1', type: 'payment_intent.succeeded', cuerpo };
  });
  (controlador as unknown as { stripe: unknown }).stripe = {
    webhooks: { constructEvent },
  };

  return { controlador, pagos, constructEvent };
}

const peticion = () => ({ rawBody: CUERPO }) as RawBodyRequest<Request>;
const peticionSinCuerpo = () =>
  ({ rawBody: undefined }) as RawBodyRequest<Request>;

describe('PaymentsWebhookController', () => {
  it('con firma válida procesa el evento y contesta a Stripe', async () => {
    const { controlador, pagos } = await construir();

    const respuesta = await controlador.handleWebhook(peticion(), FIRMA);

    expect(pagos.handleWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment_intent.succeeded' }),
    );
    // Stripe reintenta lo que no recibe un 2xx.
    expect(respuesta).toEqual({ received: true });
  });

  it('verifica contra el cuerpo crudo, no contra el ya interpretado', async () => {
    // Es la razón por la que la aplicación arranca con rawBody: true. Sobre
    // el JSON reinterpretado la firma no cuadra nunca, porque cambia el
    // orden de las claves y los espacios.
    const { controlador, constructEvent } = await construir();

    await controlador.handleWebhook(peticion(), FIRMA);

    const [cuerpo, firma, secreto] = constructEvent.mock.calls[0] as unknown[];
    expect(Buffer.isBuffer(cuerpo)).toBe(true);
    expect(cuerpo).toBe(CUERPO);
    expect(firma).toBe(FIRMA);
    expect(secreto).toBe('whsec_de_prueba');
  });

  it('una firma que no cuadra no llega a tocar ningún pago', async () => {
    // Sin esto, cualquiera podría mandar un «pago completado» inventado.
    const { controlador, pagos } = await construir({ firmaValida: false });

    await expect(controlador.handleWebhook(peticion(), FIRMA)).rejects.toThrow(
      BadRequestException,
    );
    expect(pagos.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('sin cabecera de firma se rechaza antes de verificar nada', async () => {
    const { controlador, constructEvent } = await construir();

    await expect(controlador.handleWebhook(peticion(), '')).rejects.toThrow(
      BadRequestException,
    );
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('sin cuerpo crudo tampoco', async () => {
    // Llega así si alguien quita rawBody de la configuración del servidor:
    // mejor un 400 claro que una firma que falla por un motivo que no es.
    const { controlador, constructEvent } = await construir();

    await expect(
      controlador.handleWebhook(peticionSinCuerpo(), FIRMA),
    ).rejects.toThrow(BadRequestException);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('sin secreto configurado avisa de que el servidor no está listo', async () => {
    // Un 400 diría que el problema es de quien llama, y no lo es: es que
    // falta una variable de entorno en el despliegue.
    const { controlador, pagos } = await construir({ secreto: undefined });

    await expect(controlador.handleWebhook(peticion(), FIRMA)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(pagos.handleWebhookEvent).not.toHaveBeenCalled();
  });
});
