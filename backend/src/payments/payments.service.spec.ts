import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Booking, Payment, PaymentStatus } from '../entities';
import { PaymentsService } from './payments.service';

const INTENCION = 'pi_prueba_123';

function stripeFalso() {
  return {
    paymentIntents: {
      capture: jest.fn(async () => ({ id: INTENCION })),
      cancel: jest.fn(async () => ({ id: INTENCION })),
    },
    refunds: {
      create: jest.fn(async () => ({ id: 're_prueba' })),
    },
  };
}

async function construir(pago: Partial<Payment> | null) {
  const pagos = {
    findOne: jest.fn(async () => pago as Payment | null),
    save: jest.fn(async (p: Payment) => p),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: getRepositoryToken(Payment), useValue: pagos },
      {
        provide: getRepositoryToken(Booking),
        useValue: { findOne: jest.fn() },
      },
      { provide: ConfigService, useValue: { getOrThrow: () => 'sk_test_x' } },
    ],
  }).compile();

  const servicio = module.get(PaymentsService);
  const stripe = stripeFalso();
  // El cliente de Stripe se construye dentro del servicio; se sustituye para
  // no llamar a la pasarela de verdad desde una batería de tests.
  (servicio as unknown as { stripe: unknown }).stripe = stripe;

  return { servicio, pagos, stripe };
}

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
});
