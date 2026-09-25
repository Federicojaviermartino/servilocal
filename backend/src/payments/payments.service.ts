import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  Payment,
  PaymentStatus,
  Booking,
  BookingStatus,
  NotificationType,
  User,
} from '../entities';
import { NotificationsService } from '../notifications/notifications.service';

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

/**
 * A partir de cuántos días se renueva una retención. Stripe suelta una
 * autorización sin cobrar a los siete; con cuatro, la revisión tiene tres
 * días para encontrar la API despierta antes de que caduque.
 */
export const DIAS_PARA_RENOVAR = 4;

/** Reservas cuyo dinero tiene que seguir retenido. */
const RESERVAS_ABIERTAS = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

/**
 * Los motivos con los que la plataforma cancela una retención. Una
 * cancelación con otro motivo la ha hecho Stripe —la que caduca— o alguien
 * desde su panel, y en los dos casos la reserva se ha quedado sin garantía.
 */
const CANCELACIONES_PROPIAS: Stripe.PaymentIntent.CancellationReason[] = [
  'requested_by_customer',
  'abandoned',
];

export type ResultadoRevision = 'renovada' | 'perdida' | 'conciliada' | 'nada';

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
    private readonly avisos: NotificationsService,
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

      // El bloqueo de fila serializa dos pestañas, pero no cubre un corte de
      // red: si la respuesta de Stripe se pierde, la transacción deshace la
      // fila y Stripe se queda con una intención que aquí no consta. Al
      // reintentar se crearía otra.
      //
      // La clave tiene que cumplir dos cosas a la vez. Repetirse en ese
      // reintento —y se repite, porque la fila deshecha deja el estado tal
      // como estaba— y cambiar cuando lo que se quiere es de verdad una
      // intención nueva, que es lo que pasa al regenerar una sesión de pago
      // caducada. Por eso lleva dentro cuál era la anterior: sin eso,
      // regenerar devolvería la caducada durante las 24 horas que Stripe
      // recuerda la clave.
      const claveIdempotencia = [
        'reserva',
        booking.id,
        amountInCents,
        'tras',
        existingPayment?.stripePaymentIntentId ?? 'ninguna',
      ].join(':');

      const cliente = await this.clienteDeStripe(gestor, clientId);

      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount: amountInCents,
          currency: 'eur',
          capture_method: 'manual',
          // La tarjeta se guarda en su ficha de cliente para poder renovar la
          // retención sin que tenga que estar delante: Stripe la suelta a los
          // siete días, y una reserva puede ser para dentro de un mes. Ver
          // revisarRetenciones.
          customer: cliente,
          setup_future_usage: 'off_session',
          metadata: {
            bookingId: booking.id,
            clientId,
            providerId: booking.providerId,
          },
        },
        { idempotencyKey: claveIdempotencia },
      );

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
        await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId, {
          cancellation_reason: 'requested_by_customer',
        });
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
      await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId, {
        cancellation_reason: 'abandoned',
      });
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
      case 'payment_intent.payment_failed': {
        await this.markPaymentFailed(pi.id, pi.last_payment_error?.message);
        break;
      }
      case 'payment_intent.canceled': {
        const antes = await this.markPaymentFailed(
          pi.id,
          pi.last_payment_error?.message,
        );
        // Una retención que se pierde sin que la plataforma la haya soltado:
        // hay que pedir que se vuelva a autorizar. Las que suelta la
        // plataforma llegan también por aquí, y avisar entonces sería mentir.
        if (
          antes?.estadoAnterior === PaymentStatus.HELD &&
          !CANCELACIONES_PROPIAS.includes(pi.cancellation_reason!)
        ) {
          await this.avisarReautorizacion(antes.pago);
        }
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

  /** Devuelve el pago y de dónde venía, o null si no ha cambiado nada. */
  private async markPaymentFailed(
    paymentIntentId: string,
    reason?: string,
  ): Promise<{ pago: Payment; estadoAnterior: PaymentStatus } | null> {
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!payment) return null;

    if (!puedePasarA(payment.status, PaymentStatus.FAILED)) return null;

    const estadoAnterior = payment.status;
    payment.status = PaymentStatus.FAILED;
    if (reason) payment.failureReason = reason;
    await this.paymentRepository.save(payment);
    return { pago: payment, estadoAnterior };
  }

  /**
   * La ficha de cliente en Stripe de quien paga, creándola la primera vez.
   *
   * La clave de idempotencia es su identificador: dos pestañas pagando a la
   * vez, o un reintento tras un corte, reciben la misma ficha y no dos.
   */
  private async clienteDeStripe(
    gestor: EntityManager,
    clientId: string,
  ): Promise<string> {
    const usuario = await gestor.findOne(User, {
      where: { id: clientId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        stripeCustomerId: true,
      },
    });
    if (!usuario) throw new NotFoundException('Cliente no encontrado');
    if (usuario.stripeCustomerId) return usuario.stripeCustomerId;

    const cliente = await this.stripe.customers.create(
      {
        email: usuario.email,
        name: `${usuario.firstName} ${usuario.lastName}`.trim(),
        metadata: { userId: usuario.id },
      },
      { idempotencyKey: `cliente:${usuario.id}` },
    );
    await gestor.update(User, usuario.id, { stripeCustomerId: cliente.id });
    return cliente.id;
  }

  /**
   * Revisa las retenciones de las reservas que siguen abiertas.
   *
   * Stripe suelta una autorización sin cobrar a los siete días, y una
   * reserva puede ser para dentro de un mes: sin esto, el trabajo se hacía y
   * a la hora de cobrar ya no quedaba nada retenido. De paso concilia con
   * Stripe lo que el webhook no haya contado.
   *
   * Cada pago va en su propia transacción, con la fila bloqueada y saltando
   * las que ya bloquea otra instancia: dos a la vez no renuevan dos veces. Un
   * fallo pasajero —Stripe caído, un corte— deja el pago como estaba, y se
   * vuelve a intentar en la revisión siguiente.
   */
  async revisarRetenciones(
    ahora = new Date(),
  ): Promise<Record<ResultadoRevision, number>> {
    const retenidos = await this.paymentRepository.find({
      where: { status: PaymentStatus.HELD },
      relations: ['booking'],
    });

    const resumen: Record<ResultadoRevision, number> = {
      renovada: 0,
      perdida: 0,
      conciliada: 0,
      nada: 0,
    };
    for (const pago of retenidos) {
      if (!pago.booking || !RESERVAS_ABIERTAS.includes(pago.booking.status)) {
        continue;
      }
      try {
        resumen[await this.revisarRetencion(pago.id, ahora)] += 1;
      } catch (error) {
        this.logger.warn(
          `No se pudo revisar la retención del pago ${pago.id}: ${
            error instanceof Error ? error.message : 'causa desconocida'
          }. Se volverá a intentar en la próxima revisión.`,
        );
      }
    }
    return resumen;
  }

  private async revisarRetencion(
    pagoId: string,
    ahora: Date,
  ): Promise<ResultadoRevision> {
    // Lo que se hace fuera de la transacción, una vez guardado el cambio:
    // soltar en Stripe la retención que sobra y avisar.
    let soltar: string | null = null;
    let avisar: Payment | null = null;

    const resultado = await this.dataSource.transaction(
      async (gestor): Promise<ResultadoRevision> => {
        const pago = await gestor.findOne(Payment, {
          where: { id: pagoId, status: PaymentStatus.HELD },
          lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
        });
        if (!pago) return 'nada';

        const actual = await this.stripe.paymentIntents.retrieve(
          pago.stripePaymentIntentId,
        );

        // Lo que el webhook no haya llegado a contar.
        if (actual.status === 'succeeded') {
          pago.status = PaymentStatus.COMPLETED;
          await gestor.save(pago);
          return 'conciliada';
        }
        if (actual.status === 'canceled') {
          pago.status = PaymentStatus.FAILED;
          pago.failureReason = 'La retención caducó sin llegar a cobrarse.';
          await gestor.save(pago);
          avisar = pago;
          return 'perdida';
        }
        if (actual.status !== 'requires_capture') return 'nada';

        const desde = pago.paidAt ?? pago.createdAt;
        const dias = (ahora.getTime() - desde.getTime()) / 86_400_000;
        if (dias < DIAS_PARA_RENOVAR) return 'nada';

        const nueva = await this.renovar(pago, actual);
        soltar = actual.id;
        if (nueva) {
          // La vieja se suelta después de guardar la nueva: así el aviso de
          // Stripe de que la vieja se ha cancelado ya no encuentra este pago.
          pago.stripePaymentIntentId = nueva;
          pago.paidAt = ahora;
          await gestor.save(pago);
          return 'renovada';
        }

        // No se puede renovar sin el titular delante. Se suelta ya y se le
        // pide que vuelva a autorizar el pago desde la reserva: mientras siga
        // retenido no puede, y caducaría igual en tres días.
        pago.status = PaymentStatus.FAILED;
        pago.failureReason =
          'No se pudo renovar la retención: hay que volver a autorizar el pago.';
        await gestor.save(pago);
        avisar = pago;
        return 'perdida';
      },
    );

    if (soltar) await this.soltar(soltar);
    if (avisar) await this.avisarReautorizacion(avisar);
    return resultado;
  }

  /**
   * Una retención nueva sobre la misma tarjeta, sin el titular delante.
   *
   * Devuelve su identificador, o null si no se puede: una retención de antes
   * de guardar las tarjetas no tiene ninguna guardada, la tarjeta puede haber
   * caducado y el banco puede pedir que el titular confirme. Un fallo que no
   * sea de la tarjeta se propaga, para volver a intentarlo más tarde.
   */
  private async renovar(
    pago: Payment,
    actual: Stripe.PaymentIntent,
  ): Promise<string | null> {
    const cliente =
      typeof actual.customer === 'string'
        ? actual.customer
        : actual.customer?.id;
    const metodo =
      typeof actual.payment_method === 'string'
        ? actual.payment_method
        : actual.payment_method?.id;
    if (!cliente || !metodo) return null;

    let nueva: Stripe.PaymentIntent;
    try {
      nueva = await this.stripe.paymentIntents.create(
        {
          amount: actual.amount,
          currency: actual.currency,
          customer: cliente,
          payment_method: metodo,
          capture_method: 'manual',
          off_session: true,
          confirm: true,
          metadata: { ...actual.metadata, renuevaA: actual.id },
        },
        // Si se repite tras un corte, Stripe devuelve la misma y no otra.
        { idempotencyKey: `renovacion:${pago.id}:${actual.id}` },
      );
    } catch (error) {
      if ((error as { type?: string }).type === 'StripeCardError') return null;
      throw error;
    }

    if (nueva.status === 'requires_capture') return nueva.id;

    // Pide que el titular confirme, y sin él no va a quedar retenida.
    await this.soltar(nueva.id);
    return null;
  }

  /** Suelta una retención. Si Stripe no responde, caducará sola. */
  private async soltar(paymentIntentId: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId, {
        cancellation_reason: 'abandoned',
      });
    } catch (error) {
      this.logger.warn(
        `No se soltó la retención ${paymentIntentId}: ${
          error instanceof Error ? error.message : 'causa desconocida'
        }. Caducará sola.`,
      );
    }
  }

  /**
   * Avisa de que hay que volver a autorizar el pago: al cliente, que es quien
   * puede hacerlo, y al profesional, que se ha quedado sin la garantía.
   */
  private async avisarReautorizacion(pago: Payment): Promise<void> {
    const reserva =
      pago.booking ??
      (await this.bookingRepository.findOne({
        where: { id: pago.bookingId },
      }));

    await this.avisos.crear({
      usuarioId: pago.clientId,
      tipo: NotificationType.PAYMENT_REAUTHORIZATION_REQUIRED,
      datos: { rol: 'cliente' },
      enlace: `/bookings/${pago.bookingId}/payment`,
    });
    if (reserva) {
      await this.avisos.crear({
        usuarioId: reserva.providerId,
        tipo: NotificationType.PAYMENT_REAUTHORIZATION_REQUIRED,
        datos: { rol: 'profesional' },
        enlace: `/dashboard/bookings/${pago.bookingId}`,
      });
    }
  }
}
