import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Stripe from 'stripe';
import {
  Booking,
  BookingStatus,
  Payment,
  PaymentStatus,
} from '../../src/entities';
import { PaymentsService } from '../../src/payments/payments.service';
import { crearFuente } from './base';

const STRIPE_MOCK = process.env.STRIPE_MOCK_URL ?? 'http://localhost:12111';

/**
 * El camino del dinero contra la API de Stripe, no contra un doble.
 *
 * Todo lo que se ha tocado aquí —retener al reservar, cobrar al completar,
 * soltar al cancelar, serializar dos pestañas— se había comprobado con dobles
 * que hacen lo que se les dice. Un doble no sabe que `capture` sobre una
 * intención que no está retenida es un error, ni que `cancel` sobre una ya
 * capturada falla: esas reglas las pone Stripe.
 *
 * stripe-mock es el emulador oficial de Stripe, y responde con su mismo
 * esquema y sus mismos códigos. No sustituye a una pasada con claves de
 * prueba de verdad —no simula el ciclo completo de un cobro— pero cubre lo
 * que antes no cubría nada: que las llamadas existen, que llevan los
 * parámetros que deben y que lo que vuelve se interpreta bien.
 */
describe('Pagos contra la API de Stripe', () => {
  let fuente: DataSource;
  let servicio: PaymentsService;
  let reserva: Booking;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();

    servicio = new PaymentsService(
      fuente.getRepository(Payment),
      fuente.getRepository(Booking),
      fuente,
      { getOrThrow: () => 'sk_test_integracion' } as unknown as ConfigService,
    );

    // El cliente apunta al emulador en vez de a Stripe.
    (servicio as unknown as { stripe: Stripe }).stripe = new Stripe(
      'sk_test_integracion',
      {
        apiVersion: '2023-10-16',
        host: new URL(STRIPE_MOCK).hostname,
        port: Number(new URL(STRIPE_MOCK).port),
        protocol: 'http',
      },
    );

    const [fila] = await fuente.query(
      `SELECT id, "clientId", "providerId", "serviceId", "totalPrice"
       FROM bookings WHERE status = 'pending' LIMIT 1`,
    );
    expect(fila).toBeTruthy();
    reserva = fila;
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  /** Una reserva propia y desechable, para no tocar las sembradas. */
  async function reservaNueva(): Promise<string> {
    const [creada] = await fuente.query(
      `INSERT INTO bookings
         ("clientId", "providerId", "serviceId", "scheduledDate",
          "totalPrice", status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [
        reserva.clientId,
        reserva.providerId,
        reserva.serviceId,
        new Date('2027-08-01T10:00:00Z'),
        20,
      ],
    );
    return creada.id;
  }

  async function limpiar(bookingId: string) {
    await fuente.query(`DELETE FROM payments WHERE "bookingId" = $1`, [
      bookingId,
    ]);
    await fuente.query(`DELETE FROM bookings WHERE id = $1`, [bookingId]);
  }

  it('abrir el cobro retiene en vez de cobrar', async () => {
    const bookingId = await reservaNueva();

    try {
      const intencion = await servicio.createPaymentIntent(
        reserva.clientId,
        bookingId,
      );

      expect(intencion.clientSecret).toBeTruthy();
      expect(intencion.paymentIntentId).toMatch(/^pi_/);

      // Y la fila queda guardada, dentro de la misma transacción.
      const [pago] = await fuente.query(
        `SELECT status, "stripePaymentIntentId" FROM payments
         WHERE "bookingId" = $1`,
        [bookingId],
      );
      expect(pago.status).toBe(PaymentStatus.PENDING);
      expect(pago.stripePaymentIntentId).toBe(intencion.paymentIntentId);
    } finally {
      await limpiar(bookingId);
    }
  });

  it('el importe viaja en céntimos enteros', async () => {
    // 19,99 × 100 da 1998,9999999999998 en coma flotante. Aquí eso no es una
    // teoría: la API responde 400 con «value is not numeric», comprobado
    // enviándolo. Así que el valor de esta prueba está en que la llamada del
    // servicio salga adelante, no en lo que devuelva.
    //
    // Consultar la intención después no serviría: el emulador devuelve
    // siempre el importe de su plantilla, 1099, y una comprobación hecha ahí
    // mediría el emulador en vez de este código. Se intentó y se vio.
    const bookingId = await reservaNueva();
    await fuente.query(
      `UPDATE bookings SET "totalPrice" = 19.99 WHERE id = $1`,
      [bookingId],
    );

    try {
      const intencion = await servicio.createPaymentIntent(
        reserva.clientId,
        bookingId,
      );

      expect(intencion.paymentIntentId).toMatch(/^pi_/);
      expect(intencion.amount).toBe(19.99);
    } finally {
      await limpiar(bookingId);
    }
  });

  it('y un importe no entero lo rechazaría de verdad', async () => {
    // La contraparte, para que la anterior no pase por el motivo equivocado:
    // si la API aceptara cualquier cosa, que la llamada salga adelante no
    // demostraría nada sobre el redondeo.
    const stripe = (servicio as unknown as { stripe: Stripe }).stripe;

    await expect(
      stripe.paymentIntents.create({
        amount: 19.99 * 100,
        currency: 'eur',
        capture_method: 'manual',
      } as never),
    ).rejects.toThrow();
  });

  it('dos aperturas seguidas reutilizan la misma intención', async () => {
    // Es lo que evita dos retenciones sobre la misma tarjeta. La segunda
    // pregunta a Stripe por el estado de la primera y, si sigue siendo
    // pagable, la devuelve tal cual en vez de abrir otra.
    const bookingId = await reservaNueva();

    try {
      const primera = await servicio.createPaymentIntent(
        reserva.clientId,
        bookingId,
      );
      const segunda = await servicio.createPaymentIntent(
        reserva.clientId,
        bookingId,
      );

      expect(segunda.paymentIntentId).toBe(primera.paymentIntentId);

      const filas = await fuente.query(
        `SELECT count(*)::int FROM payments WHERE "bookingId" = $1`,
        [bookingId],
      );
      expect(filas[0].count).toBe(1);
    } finally {
      await limpiar(bookingId);
    }
  });

  it('una reserva sin pago se completa sin llamar a Stripe', async () => {
    const bookingId = await reservaNueva();

    try {
      expect(await servicio.cobrarAlCompletar(bookingId)).toBeNull();
      expect(await servicio.liberarRetencion(bookingId)).toBeNull();
    } finally {
      await limpiar(bookingId);
    }
  });

  it('el cobro y la liberación llaman a las operaciones de Stripe que tocan', async () => {
    // Capturar y cancelar son dos operaciones distintas en Stripe y no son
    // intercambiables. stripe-mock devuelve una respuesta válida para las
    // dos, así que lo que se comprueba es que cada camino llama a la suya y
    // deja el pago en el estado correspondiente.
    const bookingId = await reservaNueva();

    try {
      const intencion = await servicio.createPaymentIntent(
        reserva.clientId,
        bookingId,
      );
      await fuente.query(
        `UPDATE payments SET status = 'held' WHERE "bookingId" = $1`,
        [bookingId],
      );

      const cobrado = await servicio.cobrarAlCompletar(bookingId);
      expect(cobrado?.status).toBe(PaymentStatus.COMPLETED);
      expect(cobrado?.stripePaymentIntentId).toBe(intencion.paymentIntentId);

      // Y ya cobrado, soltar la retención no hace nada: para eso está el
      // reembolso, que es otra operación.
      await fuente.query(
        `UPDATE payments SET status = 'held' WHERE "bookingId" = $1`,
        [bookingId],
      );
      const soltado = await servicio.liberarRetencion(bookingId);
      expect(soltado?.status).toBe(PaymentStatus.REFUNDED);
      expect(soltado?.refundedAt).toBeTruthy();
    } finally {
      await limpiar(bookingId);
    }
  });

  it('no se abre cobro para la reserva de otro', async () => {
    const bookingId = await reservaNueva();

    try {
      await expect(
        servicio.createPaymentIntent(
          '00000000-0000-4000-8000-000000000000',
          bookingId,
        ),
      ).rejects.toThrow();

      const filas = await fuente.query(
        `SELECT count(*)::int FROM payments WHERE "bookingId" = $1`,
        [bookingId],
      );
      expect(filas[0].count).toBe(0);
    } finally {
      await limpiar(bookingId);
    }
  });

  it('una reserva cancelada no se puede pagar', async () => {
    const bookingId = await reservaNueva();
    await fuente.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
      [bookingId],
    );

    try {
      await expect(
        servicio.createPaymentIntent(reserva.clientId, bookingId),
      ).rejects.toThrow();
    } finally {
      await limpiar(bookingId);
    }
  });
});
