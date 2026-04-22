import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Payment, PaymentStatus, Booking, BookingStatus } from '../entities';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    private configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      { apiVersion: '2023-10-16' },
    );
  }

  async createPaymentIntent(
    clientId: string,
    bookingId: string,
  ): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
  }> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (booking.clientId !== clientId) {
      throw new BadRequestException('Esta reserva no te pertenece');
    }

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new BadRequestException('La reserva no puede pagarse en su estado actual');
    }

    const existingPayment = await this.paymentRepository.findOne({
      where: { bookingId },
      order: { createdAt: 'DESC' },
    });

    // Reutilizar PI existente si su estado en Stripe sigue siendo pagable
    if (existingPayment?.stripePaymentIntentId) {
      const stripePi = await this.stripe.paymentIntents.retrieve(
        existingPayment.stripePaymentIntentId,
      );
      const reusable: Stripe.PaymentIntent.Status[] = [
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
        'processing',
      ];
      const alreadyPaid: Stripe.PaymentIntent.Status[] = [
        'requires_capture',
        'succeeded',
      ];

      if (reusable.includes(stripePi.status)) {
        if (!stripePi.client_secret) {
          throw new Error('Stripe no devolvió client_secret para el PaymentIntent existente');
        }
        return {
          clientSecret: stripePi.client_secret,
          paymentIntentId: stripePi.id,
          amount: booking.totalPrice,
          currency: 'EUR',
        };
      }

      if (alreadyPaid.includes(stripePi.status)) {
        throw new ConflictException('Esta reserva ya tiene un pago en curso o completado');
      }
      // Si el PI esta canceled o en otro estado no reutilizable, se crea uno nuevo abajo.
    }

    const amountInCents = Math.round(booking.totalPrice * 100);

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      capture_method: 'manual',
      metadata: {
        bookingId: booking.id,
        clientId,
        providerId: booking.providerId,
      },
    });

    if (!paymentIntent.client_secret) {
      throw new Error('Stripe no devolvió client_secret para el PaymentIntent');
    }

    if (existingPayment) {
      existingPayment.stripePaymentIntentId = paymentIntent.id;
      existingPayment.status = PaymentStatus.PENDING;
      existingPayment.failureReason = null as unknown as string;
      await this.paymentRepository.save(existingPayment);
    } else {
      const payment = this.paymentRepository.create({
        bookingId,
        clientId,
        amount: booking.totalPrice,
        currency: 'EUR',
        status: PaymentStatus.PENDING,
        stripePaymentIntentId: paymentIntent.id,
      });
      await this.paymentRepository.save(payment);
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: booking.totalPrice,
      currency: 'EUR',
    };
  }

  async confirmPaymentHold(paymentIntentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    payment.status = PaymentStatus.HELD;
    payment.paidAt = new Date();
    return this.paymentRepository.save(payment);
  }

  async capturePayment(bookingId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { bookingId, status: PaymentStatus.HELD },
    });

    if (!payment) {
      throw new NotFoundException('No hay pago retenido para esta reserva');
    }

    await this.stripe.paymentIntents.capture(payment.stripePaymentIntentId);

    payment.status = PaymentStatus.COMPLETED;
    return this.paymentRepository.save(payment);
  }

  async refundPayment(bookingId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { bookingId },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    if (
      payment.status !== PaymentStatus.HELD &&
      payment.status !== PaymentStatus.COMPLETED
    ) {
      throw new BadRequestException('Este pago no se puede reembolsar');
    }

    if (payment.stripePaymentIntentId) {
      await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
    }

    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAt = new Date();
    return this.paymentRepository.save(payment);
  }

  async findByClient(clientId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { clientId },
      relations: ['booking', 'booking.service'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByBooking(bookingId: string): Promise<Payment | null> {
    return this.paymentRepository.findOne({
      where: { bookingId },
    });
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    const type = event.type;
    const pi = event.data.object as Stripe.PaymentIntent;

    switch (type) {
      case 'payment_intent.amount_capturable_updated': {
        await this.markPaymentAndBooking(
          pi.id,
          PaymentStatus.HELD,
          BookingStatus.CONFIRMED,
        );
        break;
      }
      case 'payment_intent.succeeded': {
        await this.markPaymentAndBooking(
          pi.id,
          PaymentStatus.COMPLETED,
          BookingStatus.CONFIRMED,
        );
        break;
      }
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        await this.markPaymentFailed(pi.id, pi.last_payment_error?.message);
        break;
      }
      default:
        // Eventos no manejados se ignoran; Stripe requiere 2xx de todas formas.
        break;
    }
  }

  private async markPaymentAndBooking(
    paymentIntentId: string,
    paymentStatus: PaymentStatus,
    bookingStatus: BookingStatus,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!payment) return;

    payment.status = paymentStatus;
    if (paymentStatus === PaymentStatus.HELD) {
      payment.paidAt = new Date();
    }
    await this.paymentRepository.save(payment);

    const booking = await this.bookingRepository.findOne({
      where: { id: payment.bookingId },
    });
    if (!booking) return;

    if (booking.status !== bookingStatus) {
      booking.status = bookingStatus;
      if (bookingStatus === BookingStatus.CONFIRMED) {
        booking.confirmedAt = new Date();
      }
      await this.bookingRepository.save(booking);
    }
  }

  private async markPaymentFailed(
    paymentIntentId: string,
    reason?: string,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!payment) return;

    payment.status = PaymentStatus.FAILED;
    if (reason) payment.failureReason = reason;
    await this.paymentRepository.save(payment);
  }
}
