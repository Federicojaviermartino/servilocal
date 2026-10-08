import { randomUUID } from 'node:crypto';
import type { JwtService } from '@nestjs/jwt';
import Stripe from 'stripe';
import type { DataSource } from 'typeorm';
import { AUDIENCIA_API } from '../../src/auth/sesion';
import { PaymentsService } from '../../src/payments/payments.service';
import { arrancarAplicacion } from './aplicacion';

const STRIPE_MOCK = process.env.STRIPE_MOCK_URL ?? 'http://localhost:12111';

/**
 * Lo que se contesta cuando Stripe no está, con la aplicación montada.
 *
 * Abrir un pago o completar una reserva con Stripe caído respondía «Error
 * interno del servidor», un 500 que ni era verdad ni decía que bastaba con
 * repetirlo. El mapa de errores se prueba con dobles; aquí se comprueba lo
 * que los dobles no ven: que el error de la librería de verdad llega hasta
 * el filtro a través de la transacción, y que al deshacerse esta no queda
 * ni un pago a medias ni una reserva completada sin cobrar.
 */
describe('Stripe caído, con la aplicación montada', () => {
  let base: string;
  let jwt: JwtService;
  let fuente: DataSource;
  let cerrar: () => Promise<void>;
  let pagos: { stripe: Stripe };

  const cuentas = {} as Record<
    'clienta' | 'profesional',
    { id: string; email: string; role: string }
  >;
  const ids = {} as Record<'servicio' | 'pendiente' | 'porCompletar', string>;
  const INTENCION = `pi_caido_${randomUUID().slice(0, 8)}`;
  let visitante = 0;

  /** Un puerto donde no escucha nadie: la conexión se rechaza al momento. */
  const caido = () =>
    new Stripe('sk_test_integracion', {
      host: '127.0.0.1',
      port: 9,
      protocol: 'http',
      maxNetworkRetries: 0,
    });

  const emulador = () => {
    const url = new URL(STRIPE_MOCK);
    return new Stripe('sk_test_integracion', {
      host: url.hostname,
      port: Number(url.port),
      protocol: 'http',
    });
  };

  async function llamar(
    quien: keyof typeof cuentas,
    ruta: string,
    cuerpo: Record<string, unknown>,
  ) {
    const [metodo, camino] = ruta.split(' ');
    const cuenta = cuentas[quien];
    const token = jwt.sign(
      { sub: cuenta.id, email: cuenta.email, role: cuenta.role },
      { audience: AUDIENCIA_API, jwtid: randomUUID() },
    );
    visitante += 1;
    const respuesta = await fetch(`${base}${camino}`, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `10.9.0.${visitante}`,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cuerpo),
    });
    return {
      estado: respuesta.status,
      espera: respuesta.headers.get('retry-after'),
      cuerpo: (await respuesta.json()) as Record<string, unknown>,
    };
  }

  beforeAll(async () => {
    let app: Awaited<ReturnType<typeof arrancarAplicacion>>['app'];
    ({ app, base, jwt, fuente, cerrar } = await arrancarAplicacion());
    pagos = app.get(PaymentsService) as unknown as { stripe: Stripe };

    const crear = async (quien: keyof typeof cuentas, role: string) => {
      const email = `caido-${quien}-${randomUUID().slice(0, 8)}@correo.test`;
      const [{ id }] = await fuente.query(
        `INSERT INTO users (email, password, "firstName", "lastName", role)
         VALUES ($1, 'sin-contrasena', 'Prueba', 'Caída', $2)
         RETURNING id`,
        [email, role],
      );
      cuentas[quien] = { id, email, role };
    };
    await crear('clienta', 'client');
    await crear('profesional', 'provider');

    const [{ id: categoria }] = await fuente.query(
      `SELECT id FROM categories ORDER BY id LIMIT 1`,
    );
    [{ id: ids.servicio }] = await fuente.query(
      `INSERT INTO services ("providerId", "categoryId", title, description,
         "priceMin", "priceUnit", address, city, location)
       VALUES ($1, $2, 'Servicio con Stripe caído', 'De una cuenta de la prueba',
               50, 'por servicio', 'Calle Cortada 1', 'Madrid',
               ST_SetSRID(ST_MakePoint(-3.7, 40.4), 4326))
       RETURNING id`,
      [cuentas.profesional.id, categoria],
    );
    const reservar = async (estado: string, cuando: string) => {
      const [{ id }] = await fuente.query(
        `INSERT INTO bookings ("clientId", "providerId", "serviceId",
           "scheduledDate", "durationMinutes", "totalPrice", status)
         VALUES ($1, $2, $3, now() + $4::interval, 60, 50, $5)
         RETURNING id`,
        [
          cuentas.clienta.id,
          cuentas.profesional.id,
          ids.servicio,
          cuando,
          estado,
        ],
      );
      return id as string;
    };
    ids.pendiente = await reservar('pending', '20 days');
    // Con su fecha ya pasada, que es cuando se puede completar, y el dinero
    // retenido.
    ids.porCompletar = await reservar('confirmed', '-1 day');
    await fuente.query(
      `INSERT INTO payments
         ("bookingId", "clientId", amount, status, "stripePaymentIntentId", "paidAt")
       VALUES ($1, $2, 50, 'held', $3, now())`,
      [ids.porCompletar, cuentas.clienta.id, INTENCION],
    );
  });

  beforeEach(() => {
    pagos.stripe = caido();
  });

  afterAll(async () => {
    if (fuente?.isInitialized) {
      const creadas = Object.values(cuentas).map((c) => c.id);
      await fuente.query(`DELETE FROM notifications WHERE "userId" = ANY($1)`, [
        creadas,
      ]);
      await fuente.query(`DELETE FROM payments WHERE "clientId" = ANY($1)`, [
        creadas,
      ]);
      await fuente.query(`DELETE FROM bookings WHERE "clientId" = ANY($1)`, [
        creadas,
      ]);
      await fuente.query(`DELETE FROM services WHERE "providerId" = ANY($1)`, [
        creadas,
      ]);
      await fuente.query(`DELETE FROM users WHERE id = ANY($1)`, [creadas]);
    }
    await cerrar?.();
  });

  const pagoDe = async (reserva: string) =>
    (await fuente.query(`SELECT status FROM payments WHERE "bookingId" = $1`, [
      reserva,
    ])) as { status: string }[];

  const estadoDe = async (reserva: string) => {
    const [{ status }] = await fuente.query(
      `SELECT status FROM bookings WHERE id = $1`,
      [reserva],
    );
    return status as string;
  };

  it('abrir el pago: 503 con su código y cuándo volver, sin dejar un pago a medias', async () => {
    const respuesta = await llamar(
      'clienta',
      'POST /api/payments/create-intent',
      {
        bookingId: ids.pendiente,
      },
    );

    expect(respuesta).toEqual({
      estado: 503,
      espera: '30',
      cuerpo: {
        statusCode: 503,
        codigo: 'pagos-no-disponibles',
        message: expect.stringContaining('servicio de pagos'),
      },
    });
    expect(await pagoDe(ids.pendiente)).toEqual([]);
  });

  it('completar: 503, y la reserva sigue confirmada con su dinero retenido', async () => {
    // Si el cobro no se puede hacer, la reserva no se cierra: una completada
    // sin cobrar no la vuelve a mirar nadie.
    const respuesta = await llamar(
      'profesional',
      `PATCH /api/bookings/${ids.porCompletar}/status`,
      { status: 'completed' },
    );

    expect(respuesta.estado).toBe(503);
    expect(respuesta.cuerpo.codigo).toBe('pagos-no-disponibles');
    expect(respuesta.espera).toBe('30');
    expect(await estadoDe(ids.porCompletar)).toBe('confirmed');
    expect(await pagoDe(ids.porCompletar)).toEqual([{ status: 'held' }]);
  });

  it('y con Stripe en pie, lo mismo sale bien: lo de arriba no falla por otra cosa', async () => {
    pagos.stripe = emulador();

    const abierto = await llamar(
      'clienta',
      'POST /api/payments/create-intent',
      {
        bookingId: ids.pendiente,
      },
    );
    const completada = await llamar(
      'profesional',
      `PATCH /api/bookings/${ids.porCompletar}/status`,
      { status: 'completed' },
    );

    expect(abierto.estado).toBe(201);
    expect(await pagoDe(ids.pendiente)).toEqual([{ status: 'pending' }]);
    expect(completada.estado).toBe(200);
    expect(await estadoDe(ids.porCompletar)).toBe('completed');
    expect(await pagoDe(ids.porCompletar)).toEqual([{ status: 'completed' }]);
  });
});
