import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import Stripe from 'stripe';
import {
  AccionAuditada,
  Booking,
  BookingStatus,
  NotificationType,
  Payment,
  PaymentStatus,
  User,
} from '../entities';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CODIGO_SIN_PAGO_RETENIDO, PaymentsService } from './payments.service';

const INTENCION = 'pi_prueba_123';
const NUEVA = 'pi_nueva_456';

/** Quien cobra o reembolsa desde la administración. */
const ADMIN = { id: 'a1', email: 'admin@servilocal.com' };

/** La clave con la que se captura un pago: la misma en cada reintento. */
const CLAVE_CAPTURA = { idempotencyKey: `captura:p1:${INTENCION}` };

function stripeFalso() {
  return {
    paymentIntents: {
      capture: vi.fn(async () => ({ id: INTENCION })),
      cancel: vi.fn(
        async (id: string, _parametros?: Stripe.PaymentIntentCancelParams) => ({
          id,
        }),
      ),
      // Los parámetros están declarados porque alguna comprobación mira el
      // segundo, el de la clave de idempotencia.
      create: vi.fn(
        async (
          _parametros: Stripe.PaymentIntentCreateParams,
          _opciones?: Stripe.RequestOptions,
        ): Promise<Partial<Stripe.PaymentIntent>> => ({
          id: NUEVA,
          client_secret: 'cs_nueva',
          status: 'requires_payment_method',
        }),
      ),
      retrieve: vi.fn(
        async (_id: string): Promise<Partial<Stripe.PaymentIntent>> => ({
          id: INTENCION,
          client_secret: 'cs_existente',
          status: 'requires_payment_method',
        }),
      ),
    },
    customers: {
      create: vi.fn(
        async (
          _parametros: Stripe.CustomerCreateParams,
          _opciones?: Stripe.RequestOptions,
        ) => ({ id: 'cus_nuevo' }),
      ),
    },
    refunds: {
      create: vi.fn(async () => ({ id: 're_prueba' })),
    },
  };
}

/** Quien paga, tal como lo lee el servicio al abrir el cobro. */
const CLIENTE = (stripeCustomerId: string | null = null) => ({
  id: 'c1',
  email: 'ana@ejemplo.com',
  firstName: 'Ana',
  lastName: 'Núñez',
  stripeCustomerId,
});

async function construir(
  pago: Partial<Payment> | null,
  reserva: Partial<Booking> | null = null,
  usuario: Partial<User> | null = CLIENTE(),
) {
  const pagos = {
    // El doble respeta el filtro por estado, porque el servicio se apoya en
    // él: `where: { bookingId, status: HELD }` no debe devolver un pago ya
    // cobrado. Un doble que ignora el where convierte esas comprobaciones
    // en una prueba del propio doble.
    findOne: vi.fn(async (opciones?: { where?: { status?: string } }) => {
      const buscado = opciones?.where?.status;
      if (buscado && pago && (pago as Payment).status !== buscado) return null;
      return pago as Payment | null;
    }),
    find: vi.fn(async (opciones?: { where?: { status?: string } }) => {
      const buscado = opciones?.where?.status;
      if (!pago || (buscado && (pago as Payment).status !== buscado)) return [];
      return [pago as Payment];
    }),
    create: vi.fn((p: Partial<Payment>) => p as Payment),
    save: vi.fn(async (p: Payment) => p),
  };

  const reservas = {
    findOne: vi.fn(async () => reserva as Booking | null),
    save: vi.fn(async (b: Booking) => b),
  };

  // El gestor que recibe la transacción reparte según la entidad, de modo
  // que las comprobaciones siguen mirando los mismos dobles de siempre.
  const gestor = {
    findOne: vi.fn(async (entidad: unknown, opciones?: unknown) => {
      if (entidad === Booking) return await reservas.findOne();
      if (entidad === User) return usuario;
      return await pagos.findOne(opciones as never);
    }),
    save: vi.fn(async (entidad: unknown) => pagos.save(entidad as never)),
    create: vi.fn((_entidad: unknown, datos: unknown) =>
      pagos.create(datos as never),
    ),
    update: vi.fn(async () => ({ affected: 1 })),
  };

  const avisos = { crear: vi.fn(async () => null) };
  const auditoria = { anotar: vi.fn(async () => undefined) };

  const dataSource = {
    transaction: vi.fn(
      async (ejecutar: (g: typeof gestor) => Promise<unknown>) =>
        ejecutar(gestor),
    ),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: getRepositoryToken(Payment), useValue: pagos },
      { provide: getRepositoryToken(Booking), useValue: reservas },
      { provide: DataSource, useValue: dataSource },
      { provide: ConfigService, useValue: { getOrThrow: () => 'sk_test_x' } },
      { provide: NotificationsService, useValue: avisos },
      { provide: AuditoriaService, useValue: auditoria },
    ],
  }).compile();

  const servicio = module.get(PaymentsService);
  const stripe = stripeFalso();
  // El cliente de Stripe se construye dentro del servicio; se sustituye para
  // no llamar a la pasarela de verdad desde una batería de tests.
  (servicio as unknown as { stripe: unknown }).stripe = stripe;

  return {
    servicio,
    pagos,
    reservas,
    stripe,
    gestor,
    dataSource,
    avisos,
    auditoria,
  };
}

/** Lo que Stripe contesta al preguntarle por la intención. */
const enStripe = (stripe: ReturnType<typeof stripeFalso>, estado: string) =>
  stripe.paymentIntents.retrieve.mockResolvedValueOnce({
    id: INTENCION,
    client_secret: 'cs',
    status: estado as Stripe.PaymentIntent.Status,
  });

/** El 409 con su código, que es lo que la interfaz reconoce. */
async function esperarSinPagoRetenido(promesa: Promise<unknown>) {
  const error = await promesa.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ConflictException);
  expect((error as ConflictException).getResponse()).toMatchObject({
    codigo: CODIGO_SIN_PAGO_RETENIDO,
  });
}

/** Evento de Stripe con lo justo que el servicio mira. */
const evento = (type: string, pi: Record<string, unknown>) =>
  ({ type, data: { object: pi } }) as unknown as Stripe.Event;

describe('PaymentsService', () => {
  describe('cobrar lo retenido desde la administración', () => {
    const RETENIDO = () => ({
      id: 'p1',
      bookingId: 'b1',
      status: PaymentStatus.HELD,
      stripePaymentIntentId: INTENCION,
    });
    const RESERVA = (status = BookingStatus.COMPLETED) => ({
      id: 'b1',
      status,
    });

    it('captura en Stripe y lo marca completado', async () => {
      const { servicio, stripe, pagos } = await construir(
        RETENIDO(),
        RESERVA(),
      );

      const resultado = await servicio.capturePayment('b1', ADMIN);

      expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
        INTENCION,
        {},
        CLAVE_CAPTURA,
      );
      expect(resultado.status).toBe(PaymentStatus.COMPLETED);
      expect(pagos.save).toHaveBeenCalled();
    });

    it('y queda anotado en el historial', async () => {
      // Movía dinero sin dejar rastro de quién lo había hecho.
      const { servicio, auditoria } = await construir(RETENIDO(), RESERVA());

      await servicio.capturePayment('b1', ADMIN);

      expect(auditoria.anotar).toHaveBeenCalledWith({
        actor: ADMIN,
        accion: AccionAuditada.PAGO_COBRADO,
        entidad: 'pago',
        entidadId: 'p1',
        contexto: { reserva: 'b1' },
      });
    });

    it.each([
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
      BookingStatus.CANCELLED,
      BookingStatus.REJECTED,
    ])('no cobra una reserva %s', async (estado) => {
      // Cobrar una pendiente y que después el profesional la rechazara
      // dejaba cobrada una reserva rechazada.
      const { servicio, stripe, auditoria } = await construir(
        RETENIDO(),
        RESERVA(estado),
      );

      await expect(servicio.capturePayment('b1', ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
      expect(auditoria.anotar).not.toHaveBeenCalled();
    });

    it('ni cobra dos veces', async () => {
      const { servicio, stripe, auditoria } = await construir(
        { ...RETENIDO(), status: PaymentStatus.COMPLETED },
        RESERVA(),
      );

      await expect(servicio.capturePayment('b1', ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
      expect(auditoria.anotar).not.toHaveBeenCalled();
    });

    it('avisa si no hay nada retenido para esa reserva', async () => {
      const { servicio, stripe, auditoria } = await construir(null, RESERVA());

      await expect(servicio.capturePayment('b1', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
      expect(auditoria.anotar).not.toHaveBeenCalled();
    });

    it('ni si la reserva no existe', async () => {
      const { servicio } = await construir(RETENIDO(), null);

      await expect(servicio.capturePayment('b1', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('con la reserva bloqueada, antes que el pago', async () => {
      const { servicio, gestor } = await construir(RETENIDO(), RESERVA());

      await servicio.capturePayment('b1', ADMIN);

      expect(gestor.findOne).toHaveBeenNthCalledWith(1, Booking, {
        where: { id: 'b1' },
        lock: { mode: 'pessimistic_write' },
      });
    });
  });

  describe('devolver el dinero', () => {
    // La reserva ya cerrada: con ella abierta, el reembolso no se permite.
    const CERRADA = { id: 'b1', status: BookingStatus.CANCELLED };

    it('un pago retenido se cancela, porque aún no se ha cobrado', async () => {
      const { servicio, stripe } = await construir(
        {
          id: 'p1',
          bookingId: 'b1',
          status: PaymentStatus.HELD,
          stripePaymentIntentId: INTENCION,
        },
        CERRADA,
      );

      const resultado = await servicio.refundPayment('b1', ADMIN);

      // Con el motivo, para que el aviso que devuelve Stripe se reconozca
      // como propio y no pida volver a pagar.
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION, {
        cancellation_reason: 'requested_by_customer',
      });
      expect(stripe.refunds.create).not.toHaveBeenCalled();
      expect(resultado.status).toBe(PaymentStatus.REFUNDED);
    });

    it('un pago ya cobrado se reembolsa, no se cancela', async () => {
      // Son dos operaciones distintas en Stripe y no son intercambiables: un
      // intento capturado está en «succeeded» y cancelarlo es un error de la
      // pasarela, así que el cliente se queda sin su dinero y con un fallo.
      const { servicio, stripe } = await construir(
        {
          id: 'p1',
          bookingId: 'b1',
          status: PaymentStatus.COMPLETED,
          stripePaymentIntentId: INTENCION,
        },
        { id: 'b1', status: BookingStatus.COMPLETED },
      );

      const resultado = await servicio.refundPayment('b1', ADMIN);

      // Con clave, para que un reintento tras un corte no devuelva dos veces.
      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: INTENCION },
        { idempotencyKey: `reembolso:p1:${INTENCION}` },
      );
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(resultado.status).toBe(PaymentStatus.REFUNDED);
    });

    it('y queda anotado en el historial', async () => {
      const { servicio, auditoria } = await construir(
        {
          id: 'p1',
          bookingId: 'b1',
          status: PaymentStatus.COMPLETED,
          stripePaymentIntentId: INTENCION,
        },
        { id: 'b1', status: BookingStatus.COMPLETED },
      );

      await servicio.refundPayment('b1', ADMIN);

      expect(auditoria.anotar).toHaveBeenCalledWith({
        actor: ADMIN,
        accion: AccionAuditada.PAGO_REEMBOLSADO,
        entidad: 'pago',
        entidadId: 'p1',
        contexto: { reserva: 'b1' },
      });
    });

    it.each([BookingStatus.PENDING, BookingStatus.CONFIRMED])(
      'no con la reserva %s: sigue abierta',
      async (estado) => {
        // Devolver el dinero la dejaba viva y sin garantía, y después se
        // completaba sin cobrar. Para soltar la retención, se cancela.
        const { servicio, stripe, auditoria } = await construir(
          {
            id: 'p1',
            bookingId: 'b1',
            status: PaymentStatus.HELD,
            stripePaymentIntentId: INTENCION,
          },
          { id: 'b1', status: estado },
        );

        await expect(servicio.refundPayment('b1', ADMIN)).rejects.toThrow(
          ConflictException,
        );
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(stripe.refunds.create).not.toHaveBeenCalled();
        expect(auditoria.anotar).not.toHaveBeenCalled();
      },
    );

    it('no se devuelve un pago que nunca llegó a retenerse', async () => {
      const { servicio, stripe } = await construir(
        {
          id: 'p1',
          bookingId: 'b1',
          status: PaymentStatus.PENDING,
          stripePaymentIntentId: INTENCION,
        },
        CERRADA,
      );

      await expect(servicio.refundPayment('b1', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('no se devuelve dos veces', async () => {
      const { servicio, auditoria } = await construir(
        {
          id: 'p1',
          bookingId: 'b1',
          status: PaymentStatus.REFUNDED,
          stripePaymentIntentId: INTENCION,
        },
        CERRADA,
      );

      await expect(servicio.refundPayment('b1', ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(auditoria.anotar).not.toHaveBeenCalled();
    });

    it('avisa si el pago no existe', async () => {
      const { servicio } = await construir(null, CERRADA);

      await expect(servicio.refundPayment('b1', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ni si la reserva no existe', async () => {
      const { servicio } = await construir(null, null);

      await expect(servicio.refundPayment('b1', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmar la retención', () => {
    // Función y no constante: el servicio escribe sobre el objeto.
    const PENDIENTE = (status = PaymentStatus.PENDING) => ({
      id: 'p1',
      bookingId: 'b1',
      clientId: 'c1',
      status,
      stripePaymentIntentId: INTENCION,
    });
    const RESERVA = (status = BookingStatus.PENDING) => ({ id: 'b1', status });

    it('marca la fecha de pago al pasar a retenido', async () => {
      const { servicio, stripe } = await construir(PENDIENTE(), RESERVA());
      enStripe(stripe, 'requires_capture');

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(resultado.status).toBe(PaymentStatus.HELD);
      expect(resultado.paidAt).toBeInstanceOf(Date);
    });

    it('pregunta a Stripe en vez de creerse al navegador', async () => {
      // Esta ruta existe para adelantarse al webhook. Sin preguntar, era
      // una forma de marcar como pagado algo que nadie había pagado.
      const { servicio, stripe } = await construir(PENDIENTE(), RESERVA());
      enStripe(stripe, 'requires_payment_method');

      await expect(
        servicio.confirmPaymentHold(INTENCION, 'c1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('un pago ya cobrado queda completado, no retenido', async () => {
      const { servicio, stripe } = await construir(PENDIENTE(), RESERVA());
      enStripe(stripe, 'succeeded');

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(resultado.status).toBe(PaymentStatus.COMPLETED);
    });

    it('con la fila del pago bloqueada', async () => {
      // El webhook puede estar anotando lo mismo a la vez.
      const { servicio, stripe, gestor } = await construir(
        PENDIENTE(),
        RESERVA(),
      );
      enStripe(stripe, 'requires_capture');

      await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(gestor.findOne).toHaveBeenCalledWith(Payment, {
        where: { stripePaymentIntentId: INTENCION },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('no reescribe lo que ya contó el webhook', async () => {
      // Un pago reembolsado volvía a figurar como cobrado si el navegador
      // llegaba tarde con su confirmación.
      const { servicio, stripe, pagos } = await construir(
        PENDIENTE(PaymentStatus.REFUNDED),
        RESERVA(BookingStatus.COMPLETED),
      );
      enStripe(stripe, 'succeeded');

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(resultado.status).toBe(PaymentStatus.REFUNDED);
      expect(pagos.save).not.toHaveBeenCalled();
    });

    it('si la reserva se canceló mientras pagaba, suelta la retención', async () => {
      const { servicio, stripe } = await construir(
        PENDIENTE(),
        RESERVA(BookingStatus.CANCELLED),
      );
      enStripe(stripe, 'requires_capture');

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION, {
        cancellation_reason: 'abandoned',
      });
      expect(resultado.status).toBe(PaymentStatus.REFUNDED);
    });

    it('si se completó sin cobro, cobra en el acto', async () => {
      const { servicio, stripe } = await construir(
        PENDIENTE(),
        RESERVA(BookingStatus.COMPLETED),
      );
      enStripe(stripe, 'requires_capture');

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
        INTENCION,
        {},
        CLAVE_CAPTURA,
      );
      expect(resultado.status).toBe(PaymentStatus.COMPLETED);
    });

    it('si ese cobro falla, el cliente no ve un error: ya ha pagado', async () => {
      // El webhook repetirá el intento; aquí basta con que conste retenido.
      const { servicio, stripe } = await construir(
        PENDIENTE(),
        RESERVA(BookingStatus.COMPLETED),
      );
      enStripe(stripe, 'requires_capture');
      stripe.paymentIntents.capture.mockRejectedValueOnce(
        new Error('Stripe no responde'),
      );

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(resultado.status).toBe(PaymentStatus.HELD);
    });

    it('con la reserva abierta, la retención se queda como está', async () => {
      const { servicio, stripe } = await construir(
        PENDIENTE(),
        RESERVA(BookingStatus.CONFIRMED),
      );
      enStripe(stripe, 'requires_capture');

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(resultado.status).toBe(PaymentStatus.HELD);
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('no se confirma el pago de otra persona', async () => {
      // Antes bastaba con conocer el identificador de la intención.
      const { servicio, stripe } = await construir(PENDIENTE(), RESERVA());

      await expect(
        servicio.confirmPaymentHold(INTENCION, 'otro'),
      ).rejects.toThrow(ForbiddenException);
      expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('avisa si la intención no corresponde a ningún pago', async () => {
      const { servicio } = await construir(null);

      await expect(
        servicio.confirmPaymentHold('pi_fantasma', 'c1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('ver el pago de una reserva', () => {
    const PAGO = { id: 'p1', bookingId: 'b1', clientId: 'c1' };
    const RESERVA = { id: 'b1', clientId: 'c1', providerId: 'p9' };

    it('lo ve el cliente de la reserva', async () => {
      const { servicio } = await construir(PAGO, RESERVA);

      expect(
        await servicio.findByBooking('b1', { id: 'c1', role: 'client' }),
      ).toBeTruthy();
    });

    it('y el profesional', async () => {
      const { servicio } = await construir(PAGO, RESERVA);

      expect(
        await servicio.findByBooking('b1', { id: 'p9', role: 'provider' }),
      ).toBeTruthy();
    });

    it('no lo ve un tercero', async () => {
      // Dentro van el importe y la fecha de un trabajo que no es suyo.
      const { servicio } = await construir(PAGO, RESERVA);

      await expect(
        servicio.findByBooking('b1', { id: 'ajeno', role: 'client' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('la moderación sí', async () => {
      const { servicio } = await construir(PAGO, RESERVA);

      expect(
        await servicio.findByBooking('b1', { id: 'admin', role: 'admin' }),
      ).toBeTruthy();
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
        expect.anything(),
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
        expect.anything(),
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
        expect.anything(),
      );
    });

    it('la llamada lleva clave de idempotencia', async () => {
      // El bloqueo de fila ordena dos pestañas, pero no cubre que se pierda
      // la respuesta de Stripe: la transacción deshace la fila y Stripe se
      // queda con una intención que aquí no consta. Al reintentar habría
      // dos. Con la clave, el reintento devuelve la primera.
      const { servicio, stripe } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.anything(),
        { idempotencyKey: 'reserva:b1:1999:tras:ninguna' },
      );
    });

    it('y el reintento de esa misma llamada usa la misma clave', async () => {
      // Es lo único que hace que sirva de algo: si cambiara entre intentos,
      // Stripe crearía una intención nueva cada vez.
      const { servicio, stripe } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');
      await servicio.createPaymentIntent('c1', 'b1');

      const [primera, segunda] = stripe.paymentIntents.create.mock.calls;
      expect(segunda[1]).toEqual(primera[1]);
    });

    it('pero regenerar una sesión caducada usa una distinta', async () => {
      // Al caducar, el cliente pide otra intención. Con la misma clave,
      // Stripe devolvería la caducada durante 24 horas y el pago quedaría
      // imposible de completar hasta el día siguiente.
      const { servicio, stripe } = await construir(
        {
          id: 'pg1',
          bookingId: 'b1',
          stripePaymentIntentId: 'pi_caducada',
          status: PaymentStatus.PENDING,
        },
        RESERVA,
      );
      stripe.paymentIntents.retrieve = vi.fn(async () => ({
        id: 'pi_caducada',
        status: 'canceled' as Stripe.PaymentIntent.Status,
      })) as never;

      await servicio.createPaymentIntent('c1', 'b1');

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.anything(),
        { idempotencyKey: 'reserva:b1:1999:tras:pi_caducada' },
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

    it('guarda la tarjeta en una ficha de cliente, para poder renovar', async () => {
      // Sin cliente y sin permiso para usarla sin el titular delante, la
      // retención no se puede renovar y caduca a los siete días.
      const { servicio, stripe, gestor } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(stripe.customers.create).toHaveBeenCalledWith(
        {
          email: 'ana@ejemplo.com',
          name: 'Ana Núñez',
          metadata: { userId: 'c1' },
        },
        // Dos pestañas a la vez reciben la misma ficha, no dos.
        { idempotencyKey: 'cliente:c1' },
      );
      expect(gestor.update).toHaveBeenCalledWith(User, 'c1', {
        stripeCustomerId: 'cus_nuevo',
      });
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_nuevo',
          setup_future_usage: 'off_session',
          capture_method: 'manual',
        }),
        expect.anything(),
      );
    });

    it('y la ficha se crea una vez: la siguiente se reutiliza', async () => {
      const { servicio, stripe, gestor } = await construir(
        null,
        RESERVA,
        CLIENTE('cus_de_antes'),
      );

      await servicio.createPaymentIntent('c1', 'b1');

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(gestor.update).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_de_antes' }),
        expect.anything(),
      );
    });

    it('la columna del cliente se pide aparte, porque no viaja por defecto', async () => {
      // Está marcada para no salir en cada consulta de usuarios; si no se
      // pidiera, llegaría vacía y se crearía una ficha nueva en cada pago.
      const { servicio, gestor } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(gestor.findOne).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          select: expect.objectContaining({ stripeCustomerId: true }),
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

    it('una completada sin cobro se paga, y se cobra en el acto', async () => {
      // Es lo que elige el profesional al completarla sin pago retenido: que
      // el cliente pague después. El trabajo ya está hecho, así que no se
      // retiene: se cobra.
      const { servicio, stripe } = await construir(null, {
        ...RESERVA,
        status: BookingStatus.COMPLETED,
      });

      await servicio.createPaymentIntent('c1', 'b1');

      const [parametros, opciones] = stripe.paymentIntents.create.mock.calls[0];
      expect(parametros.capture_method).toBe('automatic');
      expect(parametros.setup_future_usage).toBeUndefined();
      // Otra clave: con la de retener, Stripe rechazaría unos parámetros
      // distintos.
      expect(opciones?.idempotencyKey).toBe(
        'reserva:b1:1999:cobro:tras:ninguna',
      );
    });

    it.each([PaymentStatus.COMPLETED, PaymentStatus.REFUNDED])(
      'pero no si su pago está %s',
      async (estado) => {
        const { servicio, stripe } = await construir(
          {
            id: 'p1',
            bookingId: 'b1',
            status: estado,
            stripePaymentIntentId: INTENCION,
          },
          { ...RESERVA, status: BookingStatus.COMPLETED },
        );

        await expect(servicio.createPaymentIntent('c1', 'b1')).rejects.toThrow(
          ConflictException,
        );
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
      },
    );

    it.each([BookingStatus.CANCELLED, BookingStatus.REJECTED])(
      'no se paga una reserva %s',
      async (estado) => {
        const { servicio, stripe } = await construir(null, {
          ...RESERVA,
          status: estado,
        });

        await expect(servicio.createPaymentIntent('c1', 'b1')).rejects.toThrow(
          BadRequestException,
        );
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
      },
    );

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
    // Funciones y no constantes: el servicio escribe sobre el objeto que le
    // da el repositorio, así que compartir uno entre pruebas las hacía
    // depender del orden en que se ejecutaran.
    const PAGO = (status = PaymentStatus.PENDING) => ({
      id: 'p1',
      bookingId: 'b1',
      status,
      stripePaymentIntentId: INTENCION,
    });
    const RESERVA = (status = BookingStatus.PENDING) => ({
      id: 'b1',
      status,
    });

    it('el dinero retenido se anota, y la fecha de pago con él', async () => {
      const { servicio, pagos } = await construir(PAGO(), RESERVA());

      await servicio.handleWebhookEvent(
        evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.HELD,
          paidAt: expect.any(Date),
        }),
      );
    });

    it('pero no confirma la reserva: eso lo decide el profesional', async () => {
      // Antes el webhook la confirmaba solo en cuanto el cliente pagaba, así
      // que la pantalla de «reservas recibidas» no tenía nada que aceptar y
      // el profesional se encontraba comprometido sin haber dicho que sí.
      const { servicio, reservas } = await construir(PAGO(), RESERVA());

      await servicio.handleWebhookEvent(
        evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
      );

      expect(reservas.save).not.toHaveBeenCalled();
    });

    it('el cobro efectivo completa el pago', async () => {
      const { servicio, pagos } = await construir(PAGO(), RESERVA());

      await servicio.handleWebhookEvent(
        evento('payment_intent.succeeded', { id: INTENCION }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.COMPLETED }),
      );
    });

    it('no reescribe una reserva que ya estaba en ese estado', async () => {
      const { servicio, reservas } = await construir(
        PAGO(),
        RESERVA(BookingStatus.CONFIRMED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.succeeded', { id: INTENCION }),
      );

      expect(reservas.save).not.toHaveBeenCalled();
    });

    it('un pago fallido guarda el motivo que da la pasarela', async () => {
      // Es lo único que se le puede enseñar a quien pregunta por qué no le
      // ha pasado la tarjeta.
      const { servicio, pagos, reservas } = await construir(PAGO(), RESERVA());

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
      const { servicio, pagos } = await construir(PAGO(), RESERVA());

      await servicio.handleWebhookEvent(
        evento('payment_intent.canceled', { id: INTENCION }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
    });

    it('si caduca una retención, pide a las dos partes que se vuelva a autorizar', async () => {
      const { servicio, pagos, avisos } = await construir(
        { ...PAGO(PaymentStatus.HELD), clientId: 'c1' },
        { ...RESERVA(BookingStatus.CONFIRMED), providerId: 'pr1' },
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.canceled', {
          id: INTENCION,
          cancellation_reason: 'automatic',
        }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
      expect(avisos.crear).toHaveBeenCalledWith({
        usuarioId: 'c1',
        tipo: NotificationType.PAYMENT_REAUTHORIZATION_REQUIRED,
        datos: { rol: 'cliente' },
        enlace: '/bookings/b1/payment',
      });
      expect(avisos.crear).toHaveBeenCalledWith({
        usuarioId: 'pr1',
        tipo: NotificationType.PAYMENT_REAUTHORIZATION_REQUIRED,
        datos: { rol: 'profesional' },
        enlace: '/dashboard/bookings/b1',
      });
    });

    it.each(['requested_by_customer', 'abandoned'])(
      'pero no si la soltó la plataforma (%s)',
      async (motivo) => {
        // Al cancelar una reserva o al renovar, la plataforma suelta la
        // retención con uno de estos motivos. Si el aviso llega antes de que
        // se guarde el cambio, encuentra el pago aún retenido.
        const { servicio, avisos } = await construir(
          PAGO(PaymentStatus.HELD),
          RESERVA(BookingStatus.CONFIRMED),
        );

        await servicio.handleWebhookEvent(
          evento('payment_intent.canceled', {
            id: INTENCION,
            cancellation_reason: motivo,
          }),
        );

        expect(avisos.crear).not.toHaveBeenCalled();
      },
    );

    it('ni si lo cancelado no llegó a retener nada', async () => {
      const { servicio, avisos } = await construir(PAGO(), RESERVA());

      await servicio.handleWebhookEvent(
        evento('payment_intent.canceled', {
          id: INTENCION,
          cancellation_reason: 'automatic',
        }),
      );

      expect(avisos.crear).not.toHaveBeenCalled();
    });

    it('el pago se lee con la fila bloqueada', async () => {
      // El cambio de estado de la reserva puede estar moviendo este mismo
      // dinero; sin bloqueo, uno pisaba lo del otro.
      const { servicio, gestor } = await construir(PAGO(), RESERVA());

      await servicio.handleWebhookEvent(
        evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
      );

      expect(gestor.findOne).toHaveBeenCalledWith(Payment, {
        where: { stripePaymentIntentId: INTENCION },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it.each([BookingStatus.CANCELLED, BookingStatus.REJECTED])(
      'una retención que llega con la reserva %s se suelta en el acto',
      async (estado) => {
        // Se quedaba retenida hasta que Stripe la soltaba a los siete días,
        // y entonces se pedía a las dos partes que volvieran a pagar.
        const { servicio, stripe, pagos } = await construir(
          PAGO(),
          RESERVA(estado),
        );

        await servicio.handleWebhookEvent(
          evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
        );

        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION, {
          cancellation_reason: 'abandoned',
        });
        expect(pagos.save).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: PaymentStatus.REFUNDED }),
        );
      },
    );

    it('y con la reserva completada sin cobro, se cobra', async () => {
      const { servicio, stripe, pagos } = await construir(
        PAGO(),
        RESERVA(BookingStatus.COMPLETED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
      );

      expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
        INTENCION,
        {},
        CLAVE_CAPTURA,
      );
      expect(pagos.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: PaymentStatus.COMPLETED }),
      );
    });

    it('si ese cobro falla, el aviso falla, para que Stripe lo repita', async () => {
      const { servicio, stripe } = await construir(
        PAGO(),
        RESERVA(BookingStatus.COMPLETED),
      );
      stripe.paymentIntents.capture.mockRejectedValueOnce(
        new Error('Stripe no responde'),
      );

      await expect(
        servicio.handleWebhookEvent(
          evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
        ),
      ).rejects.toThrow('Stripe no responde');
    });

    it('y el aviso repetido lo vuelve a intentar', async () => {
      // El pago ya consta retenido, así que no hay nada que anotar; pero la
      // reserva sigue completada y sin cobrar.
      const { servicio, stripe } = await construir(
        PAGO(PaymentStatus.HELD),
        RESERVA(BookingStatus.COMPLETED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
      );

      expect(stripe.paymentIntents.capture).toHaveBeenCalled();
    });

    it('si caduca con la reserva ya cerrada, no pide volver a pagar', async () => {
      const { servicio, avisos } = await construir(
        { ...PAGO(PaymentStatus.HELD), clientId: 'c1' },
        { ...RESERVA(BookingStatus.CANCELLED), providerId: 'pr1' },
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.canceled', {
          id: INTENCION,
          cancellation_reason: 'automatic',
        }),
      );

      expect(avisos.crear).not.toHaveBeenCalled();
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
      const { servicio, pagos } = await construir(PAGO(), RESERVA());

      await servicio.handleWebhookEvent(
        evento('charge.dispute.created', { id: INTENCION }),
      );

      expect(pagos.save).not.toHaveBeenCalled();
    });
  });

  describe('dos pestañas a la vez', () => {
    const RESERVA = {
      id: 'b1',
      clientId: 'c1',
      providerId: 'p9',
      status: BookingStatus.PENDING,
      totalPrice: 19.99,
    };

    it('todo ocurre dentro de una transacción', async () => {
      // Mirar si ya hay un pago y crear la intención tienen que ser una sola
      // operación. Entre las dos cosas cabía otra petición idéntica.
      const { servicio, dataSource } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('la reserva se lee con la fila bloqueada', async () => {
      // Es lo que serializa las dos pestañas: la segunda espera a que la
      // primera termine y entonces ya encuentra la intención creada.
      const { servicio, gestor } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(gestor.findOne).toHaveBeenCalledWith(
        Booking,
        expect.objectContaining({
          where: { id: 'b1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('el pago se guarda con el mismo gestor, no por fuera', async () => {
      // Guardar con el repositorio de siempre dejaría la escritura fuera de
      // la transacción, y el bloqueo no protegería lo que importa.
      const { servicio, gestor, pagos } = await construir(null, RESERVA);

      await servicio.createPaymentIntent('c1', 'b1');

      expect(gestor.save).toHaveBeenCalled();
      expect(pagos.save).toHaveBeenCalled();
    });

    it('si Stripe falla, no queda un pago a medias', async () => {
      // La excepción sale de la transacción y deshace lo escrito. Sin ella,
      // podía quedar una fila apuntando a una intención que no existe.
      const { servicio, stripe } = await construir(null, RESERVA);
      stripe.paymentIntents.create.mockRejectedValueOnce(
        new Error('Stripe no responde'),
      );

      await expect(servicio.createPaymentIntent('c1', 'b1')).rejects.toThrow(
        'Stripe no responde',
      );
    });
  });

  describe('avisos repetidos y desordenados', () => {
    // Stripe reenvía y no garantiza el orden. Está documentado, así que no
    // es un caso raro: es el funcionamiento normal con el que hay que contar.
    const PAGO = (status: PaymentStatus) => ({
      id: 'p1',
      bookingId: 'b1',
      status,
      stripePaymentIntentId: INTENCION,
    });
    const RESERVA = (status: BookingStatus) => ({ id: 'b1', status });

    it('un cobro no reabre una reserva ya completada', async () => {
      // Volvía a «confirmada», y a partir de ahí el cliente ya no podía
      // valorarla: la valoración exige una reserva completada.
      const { servicio, reservas } = await construir(
        PAGO(PaymentStatus.HELD),
        RESERVA(BookingStatus.COMPLETED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.succeeded', { id: INTENCION }),
      );

      expect(reservas.save).not.toHaveBeenCalled();
    });

    it('ni resucita una cancelada', async () => {
      const { servicio, reservas } = await construir(
        PAGO(PaymentStatus.PENDING),
        RESERVA(BookingStatus.CANCELLED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
      );

      expect(reservas.save).not.toHaveBeenCalled();
    });

    it('ni una rechazada', async () => {
      const { servicio, reservas } = await construir(
        PAGO(PaymentStatus.PENDING),
        RESERVA(BookingStatus.REJECTED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.succeeded', { id: INTENCION }),
      );

      expect(reservas.save).not.toHaveBeenCalled();
    });

    it('una cancelación tardía no marca fallido un pago ya reembolsado', async () => {
      // Reembolsar cancela la intención en Stripe, y esa cancelación vuelve
      // por el webhook. Sin la tabla de transiciones, el pago devuelto
      // acababa figurando como fallido.
      const { servicio, pagos } = await construir(
        PAGO(PaymentStatus.REFUNDED),
        RESERVA(BookingStatus.CANCELLED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.canceled', { id: INTENCION }),
      );

      expect(pagos.save).not.toHaveBeenCalled();
    });

    it('tampoco uno ya cobrado', async () => {
      const { servicio, pagos } = await construir(
        PAGO(PaymentStatus.COMPLETED),
        RESERVA(BookingStatus.COMPLETED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.payment_failed', { id: INTENCION }),
      );

      expect(pagos.save).not.toHaveBeenCalled();
    });

    it('una retención que llega tarde no rebaja un pago ya cobrado', async () => {
      // El desorden real: succeeded primero y amount_capturable_updated
      // después. Sin guardas, el pago pasaba de cobrado a retenido.
      const { servicio, pagos } = await construir(
        PAGO(PaymentStatus.COMPLETED),
        RESERVA(BookingStatus.CONFIRMED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.amount_capturable_updated', { id: INTENCION }),
      );

      expect(pagos.save).not.toHaveBeenCalled();
    });

    it('el mismo aviso dos veces deja el mismo resultado', async () => {
      // Es lo que hace innecesaria una tabla de eventos procesados: el
      // segundo no encuentra nada que cambiar.
      const pago = PAGO(PaymentStatus.PENDING);
      const { servicio, pagos } = await construir(
        pago,
        RESERVA(BookingStatus.PENDING),
      );
      const aviso = evento('payment_intent.amount_capturable_updated', {
        id: INTENCION,
      });

      await servicio.handleWebhookEvent(aviso);
      await servicio.handleWebhookEvent(aviso);

      expect(pagos.save).toHaveBeenCalledTimes(1);
      expect(pago.status).toBe(PaymentStatus.HELD);
    });

    it('una retención sí puede acabar en cobro', async () => {
      // La guarda no puede bloquear el camino normal: retenido y luego
      // capturado es exactamente lo que ocurre al completar un trabajo.
      const { servicio, pagos } = await construir(
        PAGO(PaymentStatus.HELD),
        RESERVA(BookingStatus.CONFIRMED),
      );

      await servicio.handleWebhookEvent(
        evento('payment_intent.succeeded', { id: INTENCION }),
      );

      expect(pagos.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.COMPLETED }),
      );
    });
  });

  describe('cobrar al completar y soltar al cancelar', () => {
    // Función y no constante: el servicio escribe encima del objeto que le
    // da el repositorio, así que compartir uno hace que cada prueba dependa
    // de las que se hayan ejecutado antes.
    const RETENIDO = (status = PaymentStatus.HELD) => ({
      id: 'p1',
      bookingId: 'b1',
      status,
      stripePaymentIntentId: INTENCION,
    });

    it('completar captura el importe retenido', async () => {
      const { servicio, stripe, pagos } = await construir(RETENIDO());

      const r = await servicio.cobrarAlCompletar('b1');

      // Con clave: si se repite tras un corte, Stripe no cobra dos veces.
      expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
        INTENCION,
        {},
        CLAVE_CAPTURA,
      );
      expect(r?.status).toBe(PaymentStatus.COMPLETED);
      expect(r?.paidAt).toBeInstanceOf(Date);
      expect(pagos.save).toHaveBeenCalled();
    });

    it('con el gestor de la transacción, bloquea el pago y guarda con él', async () => {
      // Es lo que decide juntos el dinero y el estado de la reserva.
      const { servicio, gestor } = await construir(RETENIDO());

      await servicio.cobrarAlCompletar('b1', {
        gestor: gestor as unknown as EntityManager,
      });

      expect(gestor.findOne).toHaveBeenCalledWith(Payment, {
        where: { bookingId: 'b1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(gestor.save).toHaveBeenCalled();
    });

    it('pendiente aquí pero retenido en Stripe: se cobra igual', async () => {
      // El aviso de Stripe puede no haber llegado todavía.
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.PENDING),
      );
      enStripe(stripe, 'requires_capture');

      const r = await servicio.cobrarAlCompletar('b1');

      expect(stripe.paymentIntents.capture).toHaveBeenCalled();
      expect(r?.status).toBe(PaymentStatus.COMPLETED);
    });

    it('pendiente aquí y ya cobrado en Stripe: se anota sin cobrar otra vez', async () => {
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.PENDING),
      );
      enStripe(stripe, 'succeeded');

      const r = await servicio.cobrarAlCompletar('b1');

      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
      expect(r?.status).toBe(PaymentStatus.COMPLETED);
    });

    it('lo ya cobrado no se vuelve a cobrar', async () => {
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.COMPLETED),
      );

      const r = await servicio.cobrarAlCompletar('b1');

      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
      expect(r?.status).toBe(PaymentStatus.COMPLETED);
    });

    it('si Stripe rechaza el cobro, se propaga', async () => {
      // Quien llama decide qué hacer, y lo que hace es no dar el trabajo por
      // completado. Tragarse el error aquí dejaría la reserva cerrada y el
      // dinero sin mover.
      const { servicio, stripe, pagos } = await construir(RETENIDO());
      stripe.paymentIntents.capture.mockRejectedValueOnce(
        new Error('tarjeta caducada'),
      );

      await expect(servicio.cobrarAlCompletar('b1')).rejects.toThrow(
        'tarjeta caducada',
      );
      expect(pagos.save).not.toHaveBeenCalled();
    });

    it('sin pago, responde 409 con su código para que decida el profesional', async () => {
      // Se completaba en silencio y sin cobrar, y después ya no había forma
      // de pagarla.
      const { servicio, stripe } = await construir(null);

      await esperarSinPagoRetenido(servicio.cobrarAlCompletar('b1'));
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });

    it('y si elige completarla sin cobro, no se cobra nada', async () => {
      const { servicio, stripe } = await construir(null);

      expect(
        await servicio.cobrarAlCompletar('b1', { sinCobro: true }),
      ).toBeNull();
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });

    it('un pago fallido tampoco es una retención', async () => {
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.FAILED),
      );

      await esperarSinPagoRetenido(servicio.cobrarAlCompletar('b1'));
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });

    it('cancelar suelta la retención', async () => {
      const { servicio, stripe } = await construir(RETENIDO());

      const r = await servicio.liberarRetencion('b1');

      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION, {
        cancellation_reason: 'abandoned',
      });
      expect(r?.status).toBe(PaymentStatus.REFUNDED);
      expect(r?.refundedAt).toBeInstanceOf(Date);
    });

    it('si Stripe no responde, la cancelación sigue adelante', async () => {
      // Al revés que el cobro: quien cancela tiene derecho a cancelar, y la
      // retención caduca sola en siete días. Bloquear la operación sería
      // peor que el fallo.
      const { servicio, stripe } = await construir(RETENIDO());
      stripe.paymentIntents.cancel.mockRejectedValueOnce(
        new Error('Stripe no responde'),
      );

      await expect(servicio.liberarRetencion('b1')).resolves.toBeNull();
    });

    it('no se suelta lo que ya se cobró', async () => {
      // Para eso está el reembolso, que es otra operación en Stripe.
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.COMPLETED),
      );

      expect(await servicio.liberarRetencion('b1')).toBeNull();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('cancelar antes de pagar cancela también la intención', async () => {
      // Solo se miraba la retenida: el cliente podía terminar de pagar desde
      // la pestaña que dejó abierta una reserva que ya no iba a ocurrir.
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.PENDING),
      );

      const r = await servicio.liberarRetencion('b1');

      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION, {
        cancellation_reason: 'abandoned',
      });
      expect(r?.status).toBe(PaymentStatus.FAILED);
      expect(r?.failureReason).toBe('La reserva se canceló antes de pagarla.');
    });

    it('y si Stripe no responde, se queda pendiente, no fallido', async () => {
      // Pendiente, la retención que llegue después se suelta al ver la
      // reserva cancelada. Fallido, ya no la tocaría nadie.
      const { servicio, stripe, pagos } = await construir(
        RETENIDO(PaymentStatus.PENDING),
      );
      stripe.paymentIntents.cancel.mockRejectedValueOnce(
        new Error('Stripe no responde'),
      );

      expect(await servicio.liberarRetencion('b1')).toBeNull();
      expect(pagos.save).not.toHaveBeenCalled();
    });

    it('un pago ya fallido no se toca', async () => {
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.FAILED),
      );

      expect(await servicio.liberarRetencion('b1')).toBeNull();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('sin pago, no hay nada que soltar', async () => {
      const { servicio, stripe } = await construir(null);

      expect(await servicio.liberarRetencion('b1')).toBeNull();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('ni se cobra lo que no está retenido', async () => {
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.PENDING),
      );

      await esperarSinPagoRetenido(servicio.cobrarAlCompletar('b1'));
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });
  });

  describe('renovar las retenciones', () => {
    const AHORA = new Date('2027-03-10T12:00:00Z');
    const HACE = (dias: number) =>
      new Date(AHORA.getTime() - dias * 86_400_000);

    const RETENIDO = (
      dias = 5,
      reserva: BookingStatus = BookingStatus.CONFIRMED,
    ): Partial<Payment> => ({
      id: 'p1',
      bookingId: 'b1',
      clientId: 'c1',
      status: PaymentStatus.HELD,
      stripePaymentIntentId: INTENCION,
      paidAt: HACE(dias),
      booking: { id: 'b1', status: reserva, providerId: 'pr1' } as Booking,
    });

    /** Lo que Stripe cuenta de la retención vieja. */
    const EN_STRIPE = (
      extra: Partial<Stripe.PaymentIntent> = {},
    ): Partial<Stripe.PaymentIntent> => ({
      id: INTENCION,
      status: 'requires_capture',
      amount: 1999,
      currency: 'eur',
      customer: 'cus_1',
      payment_method: 'pm_1',
      metadata: { bookingId: 'b1' },
      ...extra,
    });

    async function preparar(
      pago = RETENIDO(),
      enStripe = EN_STRIPE(),
      nueva: Partial<Stripe.PaymentIntent> = {
        id: NUEVA,
        status: 'requires_capture',
      },
    ) {
      const partes = await construir(pago);
      partes.stripe.paymentIntents.retrieve.mockResolvedValue(enStripe);
      partes.stripe.paymentIntents.create.mockResolvedValue(nueva);
      return { ...partes, pago };
    }

    it('una de menos de cuatro días se deja como está', async () => {
      const { servicio, stripe, pagos } = await preparar(RETENIDO(3));

      const resumen = await servicio.revisarRetenciones(AHORA);

      expect(resumen.nada).toBe(1);
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(pagos.save).not.toHaveBeenCalled();
    });

    it('a los cuatro días se retiene de nuevo sobre la misma tarjeta', async () => {
      const { servicio, stripe } = await preparar();

      const resumen = await servicio.revisarRetenciones(AHORA);

      expect(resumen.renovada).toBe(1);
      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 1999,
          currency: 'eur',
          customer: 'cus_1',
          payment_method: 'pm_1',
          capture_method: 'manual',
          off_session: true,
          confirm: true,
          metadata: { bookingId: 'b1', renuevaA: INTENCION },
        },
        // Un reintento tras un corte recibe la misma, no otra más.
        { idempotencyKey: `renovacion:p1:${INTENCION}` },
      );
    });

    it('guarda la nueva, y solo después suelta la vieja', async () => {
      // En el otro orden, el aviso de Stripe de que la vieja se ha
      // cancelado encontraría el pago aún con ella y lo daría por fallido.
      const { servicio, stripe, pagos, dataSource, pago, avisos } =
        await preparar();

      await servicio.revisarRetenciones(AHORA);

      expect(pago.stripePaymentIntentId).toBe(NUEVA);
      expect(pago.status).toBe(PaymentStatus.HELD);
      // La cuenta de los días empieza de nuevo.
      expect(pago.paidAt).toEqual(AHORA);
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION, {
        cancellation_reason: 'abandoned',
      });
      const guardado = pagos.save.mock.invocationCallOrder[0];
      const soltado = stripe.paymentIntents.cancel.mock.invocationCallOrder[0];
      expect(soltado).toBeGreaterThan(guardado);
      // Y fuera de la transacción, ya confirmada.
      const transaccion = await dataSource.transaction.mock.results[0].value;
      expect(transaccion).toBe('renovada');
      expect(avisos.crear).not.toHaveBeenCalled();
    });

    it('cuenta los días desde la creación si no consta cuándo se retuvo', async () => {
      const { servicio, stripe } = await preparar({
        ...RETENIDO(),
        paidAt: null as unknown as Date,
        createdAt: HACE(6),
      });

      expect((await servicio.revisarRetenciones(AHORA)).renovada).toBe(1);
      expect(stripe.paymentIntents.create).toHaveBeenCalled();
    });

    it('bloquea la fila y salta la que ya revisa otra instancia', async () => {
      const { servicio, gestor } = await preparar();

      await servicio.revisarRetenciones(AHORA);

      expect(gestor.findOne).toHaveBeenCalledWith(Payment, {
        where: { id: 'p1', status: PaymentStatus.HELD },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
    });

    it('si otra instancia la tiene, no hace nada', async () => {
      const { servicio, stripe, gestor } = await preparar();
      gestor.findOne.mockResolvedValueOnce(null);

      expect((await servicio.revisarRetenciones(AHORA)).nada).toBe(1);
      expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it.each([BookingStatus.COMPLETED, BookingStatus.CANCELLED])(
      'no toca la de una reserva ya %s',
      async (estado) => {
        const { servicio, stripe } = await preparar(RETENIDO(5, estado));

        await servicio.revisarRetenciones(AHORA);

        expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
      },
    );

    describe('cuando no se puede renovar', () => {
      async function comprobarPerdida(
        partes: Awaited<ReturnType<typeof preparar>>,
      ) {
        const { servicio, stripe, pago, avisos } = partes;

        const resumen = await servicio.revisarRetenciones(AHORA);

        expect(resumen.perdida).toBe(1);
        expect(pago.status).toBe(PaymentStatus.FAILED);
        expect(pago.failureReason).toMatch(/volver a autorizar/);
        // Se suelta ya: mientras siga retenida no se puede volver a pagar.
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION, {
          cancellation_reason: 'abandoned',
        });
        expect(avisos.crear).toHaveBeenCalledWith(
          expect.objectContaining({
            usuarioId: 'c1',
            tipo: NotificationType.PAYMENT_REAUTHORIZATION_REQUIRED,
            enlace: '/bookings/b1/payment',
          }),
        );
        expect(avisos.crear).toHaveBeenCalledWith(
          expect.objectContaining({
            usuarioId: 'pr1',
            enlace: '/dashboard/bookings/b1',
          }),
        );
      }

      it('la tarjeta ya no vale', async () => {
        const partes = await preparar();
        partes.stripe.paymentIntents.create.mockRejectedValue(
          Object.assign(new Error('Your card was declined.'), {
            type: 'StripeCardError',
          }),
        );

        await comprobarPerdida(partes);
      });

      it('el banco pide que el titular confirme', async () => {
        const partes = await preparar(RETENIDO(), EN_STRIPE(), {
          id: NUEVA,
          status: 'requires_action',
        });

        await comprobarPerdida(partes);
        // Y la nueva, que no retiene nada, también se suelta.
        expect(partes.stripe.paymentIntents.cancel).toHaveBeenCalledWith(
          NUEVA,
          { cancellation_reason: 'abandoned' },
        );
      });

      it('es de antes de guardar las tarjetas', async () => {
        const partes = await preparar(
          RETENIDO(),
          EN_STRIPE({ customer: null, payment_method: null }),
        );

        await comprobarPerdida(partes);
        expect(partes.stripe.paymentIntents.create).not.toHaveBeenCalled();
      });
    });

    it('un fallo pasajero deja el pago como estaba, para la próxima', async () => {
      const { servicio, stripe, pagos, avisos, pago } = await preparar();
      stripe.paymentIntents.create.mockRejectedValue(
        Object.assign(new Error('Stripe no responde'), {
          type: 'StripeConnectionError',
        }),
      );

      // No lanza: una revisión que falla no puede tumbar a quien la llama.
      const resumen = await servicio.revisarRetenciones(AHORA);

      expect(resumen).toEqual({
        renovada: 0,
        perdida: 0,
        conciliada: 0,
        nada: 0,
      });
      expect(pago.status).toBe(PaymentStatus.HELD);
      expect(pago.stripePaymentIntentId).toBe(INTENCION);
      expect(pagos.save).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(avisos.crear).not.toHaveBeenCalled();
    });

    it('si Stripe ya la cobró, lo anota sin renovar', async () => {
      // Un aviso de Stripe que no llegó: la revisión lo pone al día.
      const { servicio, stripe, pago } = await preparar(
        RETENIDO(),
        EN_STRIPE({ status: 'succeeded' }),
      );

      expect((await servicio.revisarRetenciones(AHORA)).conciliada).toBe(1);
      expect(pago.status).toBe(PaymentStatus.COMPLETED);
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('si ya había caducado, la da por perdida y avisa', async () => {
      const { servicio, stripe, pago, avisos } = await preparar(
        RETENIDO(8),
        EN_STRIPE({ status: 'canceled' }),
      );

      expect((await servicio.revisarRetenciones(AHORA)).perdida).toBe(1);
      expect(pago.status).toBe(PaymentStatus.FAILED);
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(avisos.crear).toHaveBeenCalledTimes(2);
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
          relations: { booking: { service: true } },
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });
});
