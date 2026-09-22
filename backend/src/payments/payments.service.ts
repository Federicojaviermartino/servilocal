import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Payment, PaymentStatus, Booking, BookingStatus } from '../entities';

/**
 * Desde dónde puede llegar un pago a cada estado.
 *
 * Los avisos de Stripe llegan repetidos y desordenados: está documentado y
 * hay que contar con ello. Antes cada aviso escribía el estado que traía sin
 * mirar el que había, así que un «canceled» que llegaba tarde marcaba como
 * fallido un pago recién reembolsado, y un «succeeded» reabría una reserva
 * ya cerrada.
 *
 * Con la tabla, aplicar dos veces el mismo aviso deja el mismo resultado y
 * uno que llega tarde no deshace lo que vino después. Por eso no hay una
 * tabla de eventos ya procesados: una vez que las transiciones solo avanzan,
 * deduplicar por identificador de evento no añade nada que esto no dé ya.
 */
const TRANSICIONES: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.HELD,
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
  ],
  // Una retención puede caducar sin llegar a cobrarse: Stripe la suelta a los
  // siete días y eso llega como cancelación.
  [PaymentStatus.HELD]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED],
  [PaymentStatus.COMPLETED]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REFUNDED]: [],
};

const puedePasarA = (desde: PaymentStatus, hasta: PaymentStatus): boolean =>
  TRANSICIONES[desde]?.includes(hasta) ?? false;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    private readonly dataSource: DataSource,
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
    return this.dataSource.transaction(async (gestor) => {
      // La fila de la reserva se bloquea mientras dura todo esto.
      //
      // Sin el bloqueo, dos pestañas abiertas en la pantalla de pago hacían
      // la misma secuencia a la vez: las dos miraban si ya había un pago, las
      // dos veían que no, y las dos creaban una intención en Stripe. Resultado,
      // dos retenciones sobre la misma tarjeta por la misma reserva, y la
      // segunda sin nada que la suelte, porque el resto del código solo
      // conoce una.
      //
      // Mantener la transacción abierta durante la llamada a Stripe no es
      // gratis y conviene decirlo: son unos cientos de milisegundos con una
      // fila bloqueada. Es asumible porque el bloqueo es de una reserva
      // concreta —nadie más compite por ella— y porque la alternativa es
      // cobrar dos veces.
      const booking = await gestor.findOne(Booking, {
        where: { id: bookingId },
        lock: { mode: 'pessimistic_write' },
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
        throw new BadRequestException(
          'La reserva no puede pagarse en su estado actual',
        );
      }

      const existingPayment = await gestor.findOne(Payment, {
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
            throw new Error(
              'Stripe no devolvió client_secret para el PaymentIntent existente',
            );
          }
          return {
            clientSecret: stripePi.client_secret,
            paymentIntentId: stripePi.id,
            amount: booking.totalPrice,
            currency: 'EUR',
          };
        }

        if (alreadyPaid.includes(stripePi.status)) {
          throw new ConflictException(
            'Esta reserva ya tiene un pago en curso o completado',
          );
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
        throw new Error(
          'Stripe no devolvió client_secret para el PaymentIntent',
        );
      }

      if (existingPayment) {
        existingPayment.stripePaymentIntentId = paymentIntent.id;
        existingPayment.status = PaymentStatus.PENDING;
        existingPayment.failureReason = null as unknown as string;
        await gestor.save(existingPayment);
      } else {
        const payment = gestor.create(Payment, {
          bookingId,
          clientId,
          amount: booking.totalPrice,
          currency: 'EUR',
          status: PaymentStatus.PENDING,
          stripePaymentIntentId: paymentIntent.id,
        });
        await gestor.save(payment);
      }

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: booking.totalPrice,
        currency: 'EUR',
      };
    });
  }

  /**
   * Adelanta lo que el webhook confirmará por su cuenta.
   *
   * Existe para no dejar la pantalla esperando a que Stripe llame: en un plan
   * gratuito ese aviso puede tardar. Pero antes no comprobaba nada, así que
   * cualquiera con sesión marcaba como retenido un pago que no era suyo y que
   * nadie había pagado. Ahora se exige las dos cosas: que el pago sea de quien
   * llama y que Stripe diga que el dinero está de verdad retenido.
   */
  async confirmPaymentHold(
    paymentIntentId: string,
    clientId: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    if (payment.clientId !== clientId) {
      throw new ForbiddenException('Este pago no es tuyo');
    }

    // La verdad la tiene Stripe, no el navegador que nos llama.
    const intencion =
      await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (intencion.status === 'requires_capture') {
      payment.status = PaymentStatus.HELD;
      payment.paidAt = new Date();
    } else if (intencion.status === 'succeeded') {
      payment.status = PaymentStatus.COMPLETED;
      payment.paidAt = payment.paidAt ?? new Date();
    } else {
      throw new BadRequestException(
        'Stripe no ha retenido el importe de este pago',
      );
    }

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
      if (payment.status === PaymentStatus.HELD) {
        // Retenido y sin cobrar: se suelta la retención.
        await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
      } else {
        // Ya cobrado: hay que devolver el dinero de verdad.
        await this.stripe.refunds.create({
          payment_intent: payment.stripePaymentIntentId,
        });
      }
    }

    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAt = new Date();
    return this.paymentRepository.save(payment);
  }

  /**
   * Cobra la retención al darse el trabajo por hecho.
   *
   * Hasta ahora nadie capturaba: el dinero se autorizaba al reservar y se
   * quedaba ahí hasta que Stripe soltaba la autorización a los siete días.
   * La plataforma no llegaba a cobrar nunca.
   *
   * Si el cobro falla, se propaga. Dar por completado un trabajo sin haber
   * podido cobrarlo deja la reserva cerrada y el dinero sin mover, y nadie
   * volvería a mirarlo: es mejor que el profesional vea el error y repita.
   *
   * Una reserva sin pago —las hay, porque pagar no es obligatorio para
   * reservar— se completa sin más.
   */
  async cobrarAlCompletar(bookingId: string): Promise<Payment | null> {
    const payment = await this.paymentRepository.findOne({
      where: { bookingId, status: PaymentStatus.HELD },
    });
    if (!payment) return null;

    await this.stripe.paymentIntents.capture(payment.stripePaymentIntentId);

    payment.status = PaymentStatus.COMPLETED;
    return this.paymentRepository.save(payment);
  }

  /**
   * Suelta la retención cuando la reserva no va a ocurrir.
   *
   * Al contrario que el cobro, esto no puede impedir la cancelación. Quien
   * cancela tiene derecho a cancelar, y si Stripe no responde la retención
   * caduca sola en siete días: el remedio de bloquear la operación sería
   * peor que el fallo. Se deja constancia en el registro.
   */
  async liberarRetencion(bookingId: string): Promise<Payment | null> {
    const payment = await this.paymentRepository.findOne({
      where: { bookingId, status: PaymentStatus.HELD },
    });
    if (!payment) return null;

    try {
      await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
    } catch (error) {
      this.logger.warn(
        `Retención sin liberar en la reserva ${bookingId}: ${
          error instanceof Error ? error.message : 'causa desconocida'
        }. Caducará sola en siete días.`,
      );
      return null;
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

  /** El pago de una reserva lo ven sus dos partes, y la moderación. */
  async findByBooking(
    bookingId: string,
    quien?: { id: string; role: string },
  ): Promise<Payment | null> {
    if (quien && quien.role !== 'admin') {
      const reserva = await this.bookingRepository.findOne({
        where: { id: bookingId },
      });
      if (
        reserva &&
        reserva.clientId !== quien.id &&
        reserva.providerId !== quien.id
      ) {
        throw new ForbiddenException('Esta reserva no es tuya');
      }
    }

    return this.paymentRepository.findOne({
      where: { bookingId },
    });
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    const type = event.type;
    const pi = event.data.object as Stripe.PaymentIntent;

    switch (type) {
      // Que el dinero esté retenido no confirma la reserva: eso lo decide
      // el profesional, que es quien sabe si puede ese día. Antes el
      // webhook la confirmaba solo, así que la pantalla de «reservas
      // recibidas» no tenía nada que aceptar y el botón sobraba.
      case 'payment_intent.amount_capturable_updated': {
        await this.marcarPago(pi.id, PaymentStatus.HELD);
        break;
      }
      // El cobro efectivo lo lanza la plataforma al completarse el trabajo,
      // así que cuando llega este aviso la reserva ya está donde debe.
      case 'payment_intent.succeeded': {
        await this.marcarPago(pi.id, PaymentStatus.COMPLETED);
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

  /**
   * Mueve solo el pago, nunca la reserva.
   *
   * El webhook dejó de tocar el estado de la reserva: lo decide el
   * profesional al aceptar y la plataforma al completar. Aquí únicamente se
   * anota lo que Stripe dice del dinero, y solo si la transición está
   * permitida, porque los avisos llegan repetidos y desordenados.
   */
  private async marcarPago(
    paymentIntentId: string,
    estado: PaymentStatus,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!payment) return;

    if (!puedePasarA(payment.status, estado)) return;

    payment.status = estado;
    if (estado === PaymentStatus.HELD) {
      payment.paidAt = new Date();
    }
    await this.paymentRepository.save(payment);
  }

  private async markPaymentFailed(
    paymentIntentId: string,
    reason?: string,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!payment) return;

    if (!puedePasarA(payment.status, PaymentStatus.FAILED)) return;

    payment.status = PaymentStatus.FAILED;
    if (reason) payment.failureReason = reason;
    await this.paymentRepository.save(payment);
  }
}
