import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
  ): Promise<{ clientSecret: string; paymentId: string }> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (booking.clientId !== clientId) {
      throw new BadRequestException('Esta reserva no te pertenece');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('La reserva debe estar confirmada para pagar');
    }

    const existingPayment = await this.paymentRepository.findOne({
      where: { bookingId, status: PaymentStatus.HELD },
    });

    if (existingPayment) {
      throw new BadRequestException('Ya existe un pago en retención para esta reserva');
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

    const payment = this.paymentRepository.create({
      bookingId,
      clientId,
      amount: booking.totalPrice,
      currency: 'EUR',
      status: PaymentStatus.PENDING,
      stripePaymentIntentId: paymentIntent.id,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    if (!paymentIntent.client_secret) {
      throw new Error('Stripe no devolvió client_secret para el PaymentIntent');
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentId: savedPayment.id,
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
}
