import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
    // El doble respeta el filtro por estado, porque el servicio se apoya en
    // él: `where: { bookingId, status: HELD }` no debe devolver un pago ya
    // cobrado. Un doble que ignora el where convierte esas comprobaciones
    // en una prueba del propio doble.
    findOne: jest.fn(async (opciones?: { where?: { status?: string } }) => {
      const buscado = opciones?.where?.status;
      if (buscado && pago && (pago as Payment).status !== buscado) return null;
      return pago as Payment | null;
    }),
    find: jest.fn(async () => [] as Payment[]),
    create: jest.fn((p: Partial<Payment>) => p as Payment),
    save: jest.fn(async (p: Payment) => p),
  };

  const reservas = {
    findOne: jest.fn(async () => reserva as Booking | null),
    save: jest.fn(async (b: Booking) => b),
  };

  // El gestor que recibe la transacción reparte según la entidad, de modo
  // que las comprobaciones siguen mirando los mismos dobles de siempre.
  const gestor = {
    findOne: jest.fn(async (entidad: unknown, opciones?: unknown) =>
      entidad === Booking
        ? await reservas.findOne()
        : await pagos.findOne(opciones as never),
    ),
    save: jest.fn(async (entidad: unknown) => pagos.save(entidad as never)),
    create: jest.fn((_entidad: unknown, datos: unknown) =>
      pagos.create(datos as never),
    ),
  };

  const dataSource = {
    transaction: jest.fn(
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
    ],
  }).compile();

  const servicio = module.get(PaymentsService);
  const stripe = stripeFalso();
  // El cliente de Stripe se construye dentro del servicio; se sustituye para
  // no llamar a la pasarela de verdad desde una batería de tests.
  (servicio as unknown as { stripe: unknown }).stripe = stripe;

  return { servicio, pagos, reservas, stripe, gestor, dataSource };
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
    const PENDIENTE = {
      id: 'p1',
      clientId: 'c1',
      status: PaymentStatus.PENDING,
      stripePaymentIntentId: INTENCION,
    };

    /** Lo que Stripe contesta al preguntarle por la intención. */
    const enStripe = (stripe: ReturnType<typeof stripeFalso>, estado: string) =>
      stripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: INTENCION,
        client_secret: 'cs',
        status: estado as Stripe.PaymentIntent.Status,
      });

    it('marca la fecha de pago al pasar a retenido', async () => {
      const { servicio, stripe } = await construir(PENDIENTE);
      enStripe(stripe, 'requires_capture');

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(resultado.status).toBe(PaymentStatus.HELD);
      expect(resultado.paidAt).toBeInstanceOf(Date);
    });

    it('pregunta a Stripe en vez de creerse al navegador', async () => {
      // Esta ruta existe para adelantarse al webhook. Sin preguntar, era
      // una forma de marcar como pagado algo que nadie había pagado.
      const { servicio, stripe } = await construir(PENDIENTE);
      enStripe(stripe, 'requires_payment_method');

      await expect(
        servicio.confirmPaymentHold(INTENCION, 'c1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('un pago ya cobrado queda completado, no retenido', async () => {
      const { servicio, stripe } = await construir(PENDIENTE);
      enStripe(stripe, 'succeeded');

      const resultado = await servicio.confirmPaymentHold(INTENCION, 'c1');

      expect(resultado.status).toBe(PaymentStatus.COMPLETED);
    });

    it('no se confirma el pago de otra persona', async () => {
      // Antes bastaba con conocer el identificador de la intención.
      const { servicio, stripe } = await construir(PENDIENTE);

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

      expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(INTENCION);
      expect(r?.status).toBe(PaymentStatus.COMPLETED);
      expect(pagos.save).toHaveBeenCalled();
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

    it('una reserva sin pago se completa sin cobrar nada', async () => {
      // Reservar no obliga a pagar, así que hay reservas sin pago asociado.
      const { servicio, stripe } = await construir(null);

      expect(await servicio.cobrarAlCompletar('b1')).toBeNull();
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });

    it('cancelar suelta la retención', async () => {
      const { servicio, stripe } = await construir(RETENIDO());

      const r = await servicio.liberarRetencion('b1');

      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(INTENCION);
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

    it('ni se cobra lo que no está retenido', async () => {
      const { servicio, stripe } = await construir(
        RETENIDO(PaymentStatus.PENDING),
      );

      expect(await servicio.cobrarAlCompletar('b1')).toBeNull();
      expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
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
