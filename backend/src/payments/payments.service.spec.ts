import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { Booking, BookingStatus, Payment, PaymentStatus } from '../entities';
import { PaymentsService } from './payments.service';

const INTENCION = 'pi_prueba_123';
const NUEVA = 'pi_nueva_456';

function stripeFalso() {
  return {
    paymentIntents: {
      capture: jest.fn(async () => ({ id: INTENCION })),
      cancel: jest.fn(async () => ({ id: INTENCION })),
      create: jest.fn(async () => ({
        id: NUEVA,
        client_secret: 'cs_nueva',
      })),
      retrieve: jest.fn(async () => ({
        id: INTENCION,
        client_secret: 'cs_existente',
        status: 'requires_payment_method' as Stripe.PaymentIntent.Status,
      })),
    },
    refunds: {
      create: jest.fn(async () => ({ id: 're_prueba' })),
    },
  };
}

async function construir(
  pago: Partial<Payment> | null,
  reserva: Partial<Booking> | null = null,
) {
  const pagos = {
    findOne: jest.fn(async () => pago as Payment | null),
    find: jest.fn(async () => [] as Payment[]),
    create: jest.fn((p: Partial<Payment>) => p as Payment),
    save: jest.fn(async (p: Payment) => p),
  };

  const reservas = {
    findOne: jest.fn(async () => reserva as Booking | null),
    save: jest.fn(async (b: Booking) => b),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: getRepositoryToken(Payment), useValue: pagos },
      { provide: getRepositoryToken(Booking), useValue: reservas },
      { provide: ConfigService, useValue: { getOrThrow: () => 'sk_test_x' } },
    ],
  }).compile();

  const servicio = module.get(PaymentsService);
  const stripe = stripeFalso();
  // El cliente de Stripe se construye dentro del servicio; se sustituye para
  // no llamar a la pasarela de verdad desde una batería de tests.
  (servicio as unknown as { stripe: unknown }).stripe = stripe;

  return { servicio, pagos, reservas, stripe };
}

/** Evento de Stripe con lo justo que el servicio mira. */
const evento = (type: string, pi: Record<string, unknown>) =>
  ({ type, data: { object: pi } }) as unknown as Stripe.Event;

describe('PaymentsService', () => {
  describe('cobrar lo retenido', () => {
    it('captura en Stripe y lo marca completado', async () => {
      const { servicio, stripe, pagos } = await construir({
        id: 'p1',
        bookingId: 'b1',
        status: PaymentStatus.HELD,
        stripePaymentIntentId: INTENCION,
      });

      const resultado = await servicio.capturePayment('b1');

      expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(INTENCION);
      expect(resultado.status).toBe(PaymentStatus.COMPLETED);
      expect(pagos.save).toHaveBeenCalled();
    });

    it('avisa si no hay nada retenido para esa reserva', async () => {
      const { servicio, stripe } = await construir(null);

      await expect(servicio.capturePayment('b1')).rejects.toThrow(
        NotFoundException,
      );
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });
  });

  describe('devolver el dinero', () => {
    it('un pago retenido se cancela, porque aún no se ha cobrado', async () => {
      const { servicio, stripe } = await construir({
        id: 'p1',
        bookingId: 'b1',
        status: PaymentStatus.HELD,
        stripePaymentIntentId: INTENCION,
      });

      const resultado = await servicio.refundPayment('b1');

      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION);
      expect(stripe.refunds.create).not.toHaveBeenCalled();
      expect(resultado.status).toBe(PaymentStatus.REFUNDED);
    });

    it('un pago ya cobrado se reembolsa, no se cancela', async () => {
      // Son dos operaciones distintas en Stripe y no son intercambiables: un
      // intento capturado está en «succeeded» y cancelarlo es un error de la
      // pasarela, así que el cliente se queda sin su dinero y con un fallo.
      const { servicio, stripe } = await construir({
        id: 'p1',
        bookingId: 'b1',
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: INTENCION,
      });

      const resultado = await servicio.refundPayment('b1');

      expect(stripe.refunds.create).toHaveBeenCalledWith({
        payment_intent: INTENCION,
      });
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(resultado.status).toBe(PaymentStatus.REFUNDED);
    });

    it('no se devuelve un pago que nunca llegó a retenerse', async () => {
      const { servicio, stripe } = await construir({
        id: 'p1',
        bookingId: 'b1',
        status: PaymentStatus.PENDING,
        stripePaymentIntentId: INTENCION,
      });

      await expect(servicio.refundPayment('b1')).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('no se devuelve dos veces', async () => {
      const { servicio } = await construir({
        id: 'p1',
        bookingId: 'b1',
        status: PaymentStatus.REFUNDED,
        stripePaymentIntentId: INTENCION,
      });

      await expect(servicio.refundPayment('b1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('avisa si el pago no existe', async () => {
      const { servicio } = await construir(null);

      await expect(servicio.refundPayment('b1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmar la retención', () => {
    it('marca la fecha de pago al pasar a retenido', async () => {
      const { servicio } = await construir({
        id: 'p1',
        status: PaymentStatus.PENDING,
        stripePaymentIntentId: INTENCION,
      });

      const resultado = await servicio.confirmPaymentHold(INTENCION);

      expect(resultado.status).toBe(PaymentStatus.HELD);
      expect(resultado.paidAt).toBeInstanceOf(Date);
    });

    it('avisa si la intención no corresponde a ningún pago', async () => {
      const { servicio } = await construir(null);

      await expect(servicio.confirmPaymentHold('pi_fantasma')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
  describe('abrir el cobro', () => {
    const RESERVA = {
      id: 'b1',
      clientId: 'c1',
      providerId: 'p9',
      status: BookingStatus.PENDING,
      totalPrice: 19.99,
    };

    it('retiene el dinero en lugar de cobrarlo', async () => {
      // Es la decisión que sostiene el modelo: se autoriza al reservar y solo
      // se cobra cuando el trabajo se da por hecho. Sin «manual» el dinero
      // sale de la cuenta del cliente antes de que nadie haya movido un dedo.
      const { servicio, stripe } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ capture_method: 'manual', currency: 'eur' }),
      );
    });

    it('manda céntimos enteros, no euros con decimales', async () => {
      // 19,99 × 100 da 1998,9999999999998 en coma flotante. Sin redondear,
      // Stripe recibe un importe no entero y rechaza la llamada entera.
      // (Con 49,99 la multiplicación sale exacta y no probaría nada.)
      const { servicio, stripe } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1999 }),
      );
    });

    it('deja en los metadatos con quién va cada cobro', async () => {
      // Es lo único que relaciona un cobro del panel de Stripe con una
      // reserva de aquí cuando hay que conciliar a mano.
      const { servicio, stripe } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { bookingId: 'b1', clientId: 'c1', providerId: 'p9' },
        }),
      );
    });

    it('guarda el pago pendiente con la intención recién creada', async () => {
      const { servicio, pagos } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'b1',
          clientId: 'c1',
          amount: 19.99,
          status: PaymentStatus.PENDING,
          stripePaymentIntentId: NUEVA,
        }),
      );
    });

    it('no deja pagar la reserva de otro', async () => {
      const { servicio, stripe } = await construir(null, RESERVA);

      await expect(servicio.createPaymentIntent('otro', 'b1')).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('avisa si la reserva no existe', async () => {
      const { servicio } = await construir(null, null);

      await expect(servicio.createPaymentIntent('c1', 'b1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      BookingStatus.CANCELLED,
      BookingStatus.REJECTED,
      BookingStatus.COMPLETED,
    ])('no se paga una reserva %s', async (estado) => {
      const { servicio, stripe } = await construir(null, {
        ...RESERVA,
        status: estado,
      });

      await expect(servicio.createPaymentIntent('c1', 'b1')).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('reaprovecha la intención que sigue siendo pagable', async () => {
      // Volver a la pantalla de pago no debe abrir un cobro nuevo: serían dos
      // retenciones sobre la misma tarjeta por la misma reserva.
      const { servicio, stripe } = await construir(
        { id: 'p1', stripePaymentIntentId: INTENCION },
        RESERVA,
      );

      const r = await servicio.createPaymentIntent('c1', 'b1');

      expect(r.clientSecret).toBe('cs_existente');
      expect(r.paymentIntentId).toBe(INTENCION);
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it.each(['requires_capture', 'succeeded'])(
      'se niega a cobrar dos veces cuando la intención está en %s',
      async (estado) => {
        const { servicio, stripe } = await construir(
          { id: 'p1', stripePaymentIntentId: INTENCION },
          RESERVA,
        );
        stripe.paymentIntents.retrieve.mockResolvedValueOnce({
          id: INTENCION,
          client_secret: 'cs_existente',
          status: estado as Stripe.PaymentIntent.Status,
        });

        await expect(servicio.createPaymentIntent('c1', 'b1')).rejects.toThrow(
          ConflictException,
        );
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
      },
    );

    it('si la anterior quedó cancelada, abre otra y reutiliza la fila', async () => {
      // Sin esto, una tarjeta rechazada dejaría la reserva imposible de pagar
      // para siempre. Y se limpia el motivo del fallo anterior: si no, el
      // cobro nuevo nace con la excusa del viejo pegada.
      const anterior = {
        id: 'p1',
        stripePaymentIntentId: INTENCION,
        status: PaymentStatus.FAILED,
        failureReason: 'Tarjeta rechazada',
      };
      const { servicio, pagos, stripe } = await construir(anterior, RESERVA);
      stripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: INTENCION,
        client_secret: 'cs_existente',
        status: 'canceled' as Stripe.PaymentIntent.Status,
      });

      const r = await servicio.createPaymentIntent('c1', 'b1');

      expect(r.paymentIntentId).toBe(NUEVA);
      expect(pagos.create).not.toHaveBeenCalled();
      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'p1',
          stripePaymentIntentId: NUEVA,
          status: PaymentStatus.PENDING,
          failureReason: null,
        }),
      );
    });
  });

  describe('lo que cuenta Stripe por el webhook', () => {
    const PAGO = {
      id: 'p1',
      bookingId: 'b1',
      status: PaymentStatus.PENDING,
      stripePaymentIntentId: INTENCION,
    };
    const RESERVA = { id: 'b1', status: BookingStatus.PENDING };

    it('el dinero retenido confirma la reserva y deja la fecha', async () => {
      const { servicio, pagos, reservas } = await construir(PAGO, RESERVA);

      await servicio.handleWebhookEvent(
        evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.HELD,
          paidAt: expect.any(Date),
        }),
      );
      expect(reservas.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BookingStatus.CONFIRMED,
          confirmedAt: expect.any(Date),
        }),
      );
    });

    it('el cobro efectivo completa el pago', async () => {
      const { servicio, pagos } = await construir(PAGO, RESERVA);

      await servicio.handleWebhookEvent(
        evento('payment_intent.succeeded', { id: INTENCION }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.COMPLETED }),
      );
    });

    it('no reescribe una reserva que ya estaba en ese estado', async () => {
      const { servicio, reservas } = await construir(PAGO, {
        id: 'b1',
        status: BookingStatus.CONFIRMED,
      });

      await servicio.handleWebhookEvent(
        evento('payment_intent.succeeded', { id: INTENCION }),
      );

      expect(reservas.save).not.toHaveBeenCalled();
    });

    it('un pago fallido guarda el motivo que da la pasarela', async () => {
      // Es lo único que se le puede enseñar a quien pregunta por qué no le
      // ha pasado la tarjeta.
      const { servicio, pagos, reservas } = await construir(PAGO, RESERVA);

      await servicio.handleWebhookEvent(
        evento('payment_intent.payment_failed', {
          id: INTENCION,
          last_payment_error: { message: 'Fondos insuficientes' },
        }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.FAILED,
          failureReason: 'Fondos insuficientes',
        }),
      );
      // Y la reserva se queda como estaba: el cliente puede reintentar.
      expect(reservas.save).not.toHaveBeenCalled();
    });

    it('una intención cancelada también marca el pago fallido', async () => {
      const { servicio, pagos } = await construir(PAGO, RESERVA);

      await servicio.handleWebhookEvent(
        evento('payment_intent.canceled', { id: INTENCION }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
    });

    it('un evento de un pago que aquí no existe no rompe nada', async () => {
      // Stripe reenvía eventos y exige un 2xx: lanzar aquí provocaría
      // reintentos indefinidos por algo que no tiene arreglo.
      const { servicio, pagos } = await construir(null, null);

      await expect(
        servicio.handleWebhookEvent(
          evento('payment_intent.succeeded', { id: 'pi_desconocida' }),
        ),
      ).resolves.toBeUndefined();
      expect(pagos.save).not.toHaveBeenCalled();
    });

    it('un evento que no se maneja se ignora en silencio', async () => {
      const { servicio, pagos } = await construir(PAGO, RESERVA);

      await servicio.handleWebhookEvent(
        evento('charge.dispute.created', { id: INTENCION }),
      );

      expect(pagos.save).not.toHaveBeenCalled();
    });
  });

  describe('consultas', () => {
    it('los pagos de un cliente llegan con su reserva y su servicio', async () => {
      // La pantalla enseña qué se pagó, no solo cuánto: sin las relaciones
      // saldría una lista de importes sueltos.
      const { servicio, pagos } = await construir(null);

      await servicio.findByClient('c1');

      expect(pagos.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'c1' },
          relations: ['booking', 'booking.service'],
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });
});
