import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  AdminService,
  TOPE_DE_PAGOS,
  type PagoPorRevisar,
} from '../../src/admin/admin.service';
import { Booking, Category, Review, Service, User } from '../../src/entities';
import { crearFuente } from './base';

/**
 * Los pagos que la administración tiene que mirar, contra la base de verdad.
 *
 * Cada motivo es una combinación del estado de la reserva, el del pago y la
 * fecha, con una unión externa porque puede no haber pago. Con dobles solo
 * se comprobaría qué se hace con las filas; cuáles salen, y cuáles no, lo
 * decide la consulta.
 */
describe('Los pagos por revisar del panel', () => {
  let fuente: DataSource;
  let admin: AdminService;

  const cuentas = {} as Record<
    'clienta' | 'profesional' | 'clientaDemo' | 'profesionalDemo',
    string
  >;
  const reservas = {} as Record<string, string>;

  /** Una reserva con su pago, si lo lleva, de un mundo o del otro. */
  async function reservar(
    nombre: string,
    estado: string,
    cuando: string,
    pago: string | null,
    demostracion = false,
  ): Promise<void> {
    const cliente = demostracion ? cuentas.clientaDemo : cuentas.clienta;
    const profesional = demostracion
      ? cuentas.profesionalDemo
      : cuentas.profesional;
    const [{ id: servicio }] = await fuente.query(
      `SELECT id FROM services WHERE "providerId" = $1`,
      [profesional],
    );
    const [{ id }] = await fuente.query(
      `INSERT INTO bookings ("clientId", "providerId", "serviceId",
         "scheduledDate", "durationMinutes", "totalPrice", status)
       VALUES ($1, $2, $3, now() + $4::interval, 60, 80, $5)
       RETURNING id`,
      [cliente, profesional, servicio, cuando, estado],
    );
    reservas[nombre] = id;
    if (pago) {
      await fuente.query(
        `INSERT INTO payments ("bookingId", "clientId", amount, status)
         VALUES ($1, $2, 75.5, $3)`,
        [id, cliente, pago],
      );
    }
  }

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    admin = new AdminService(
      fuente.getRepository(User),
      fuente.getRepository(Service),
      fuente.getRepository(Booking),
      fuente.getRepository(Review),
      fuente.getRepository(Category),
    );

    const [{ id: categoria }] = await fuente.query(
      `SELECT id FROM categories ORDER BY id LIMIT 1`,
    );
    const crear = async (
      quien: keyof typeof cuentas,
      role: string,
      nombre: string,
      demostracion: boolean,
    ) => {
      const [{ id }] = await fuente.query(
        `INSERT INTO users
           (email, password, "firstName", "lastName", role, "esDemostracion")
         VALUES ($1, 'sin-contrasena', $2, 'Revisable', $3, $4)
         RETURNING id`,
        [
          `revisar-${quien}-${randomUUID().slice(0, 8)}@correo.test`,
          nombre,
          role,
          demostracion,
        ],
      );
      cuentas[quien] = id;
      if (role === 'provider') {
        await fuente.query(
          `INSERT INTO services ("providerId", "categoryId", title, description,
             "priceMin", "priceUnit", address, city, location)
           VALUES ($1, $2, $3, 'De una cuenta de la prueba', 50, 'por servicio',
                   'Calle del Dinero 1', 'Madrid',
                   ST_SetSRID(ST_MakePoint(-3.7, 40.4), 4326))`,
          [id, categoria, `Servicio de ${nombre}`],
        );
      }
    };
    await crear('clienta', 'client', 'Clara', false);
    await crear('profesional', 'provider', 'Pablo', false);
    await crear('clientaDemo', 'client', 'Diana', true);
    await crear('profesionalDemo', 'provider', 'Dario', true);

    // Lo que tiene que salir. Las fechas de cada motivo van ordenadas.
    await reservar('canceladaRetenida', 'cancelled', '-9 days', 'held');
    await reservar('completadaRetenida', 'completed', '-8 days', 'held');
    await reservar('sinCerrar', 'confirmed', '-5 days', 'held');
    // Muy antiguas, para que salgan antes que las de la semilla dentro de
    // su motivo y no se queden fuera del tope.
    await reservar('completadaSinPago', 'completed', '-500 days', null);
    await reservar('completadaFallida', 'completed', '-499 days', 'failed');
    await reservar('deDemostracion', 'completed', '-7 days', 'held', true);

    // Y lo que no.
    await reservar('reciente', 'confirmed', '-3 hours', 'held');
    await reservar('futura', 'confirmed', '6 days', 'held');
    await reservar('cobrada', 'completed', '-20 days', 'completed');
    await reservar('devuelta', 'cancelled', '-21 days', 'refunded');
    await reservar('pendiente', 'pending', '9 days', 'pending');
    await reservar('rechazadaSinPago', 'rejected', '-22 days', null);
  });

  afterAll(async () => {
    if (fuente?.isInitialized) {
      const creadas = Object.values(cuentas);
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
      await fuente.destroy();
    }
  });

  /** De lo que devuelve el panel, lo que es de esta prueba, por su nombre. */
  const mios = (pagos: PagoPorRevisar[]) => {
    const nombres = new Map(
      Object.entries(reservas).map(([nombre, id]) => [id, nombre]),
    );
    return pagos
      .filter((pago) => nombres.has(pago.reservaId))
      .map((pago) => ({ ...pago, nombre: nombres.get(pago.reservaId) }));
  };

  it('salen los tres motivos, del más urgente al menos, y nada más', async () => {
    const { pagos } = await admin.pagosPorRevisar();

    expect(mios(pagos).map(({ nombre, motivo }) => [nombre, motivo])).toEqual([
      ['canceladaRetenida', 'retenido-con-reserva-cerrada'],
      ['completadaRetenida', 'retenido-con-reserva-cerrada'],
      ['deDemostracion', 'retenido-con-reserva-cerrada'],
      ['sinCerrar', 'retenido-sin-completar'],
      ['completadaSinPago', 'completada-sin-cobrar'],
      ['completadaFallida', 'completada-sin-cobrar'],
    ]);
    expect(pagos.length).toBeLessThanOrEqual(TOPE_DE_PAGOS);
  });

  it('cada uno dice qué reserva es, cómo está su pago y cuánto es', async () => {
    const { pagos } = await admin.pagosPorRevisar();
    const porNombre = Object.fromEntries(
      mios(pagos).map((pago) => [pago.nombre, pago]),
    );

    expect(porNombre.sinCerrar).toMatchObject({
      estadoReserva: 'confirmed',
      estadoPago: 'held',
      // Lo retenido, que es lo que se cobraría.
      importe: 75.5,
      servicio: 'Servicio de Pablo',
      cliente: 'Clara Revisable',
      profesional: 'Pablo Revisable',
    });
    expect(porNombre.sinCerrar.fecha).toBeInstanceOf(Date);
    // Sin pago, el de la reserva.
    expect(porNombre.completadaSinPago).toMatchObject({
      estadoPago: null,
      importe: 80,
    });
  });

  it('los totales cuentan todo lo que hay, quepa o no en la lista', async () => {
    const { totales } = await admin.pagosPorRevisar();
    // La misma cuenta, escrita de otra manera.
    const [esperado] = await fuente.query(
      `SELECT
         count(*) FILTER (WHERE p.status = 'held'
           AND b.status IN ('cancelled', 'rejected', 'completed'))::int AS cerrada,
         count(*) FILTER (WHERE p.status = 'held' AND b.status = 'confirmed'
           AND b."scheduledDate" < now() - interval '2 days 1 hour')::int AS "sinCerrar",
         count(*) FILTER (WHERE b.status = 'completed'
           AND coalesce(p.status::text, 'ninguno') IN ('ninguno', 'pending', 'failed'))::int AS "sinCobrar"
       FROM bookings b LEFT JOIN payments p ON p."bookingId" = b.id`,
    );

    expect(totales).toEqual({
      'retenido-con-reserva-cerrada': esperado.cerrada,
      'retenido-sin-completar': esperado.sinCerrar,
      'completada-sin-cobrar': esperado.sinCobrar,
    });
    expect(totales['retenido-con-reserva-cerrada']).toBeGreaterThanOrEqual(3);
  });

  it('la administración de demostración solo ve lo de su mundo, con el apellido acortado', async () => {
    // Su contraseña está publicada: lo de las cuentas reales, con sus
    // nombres y sus importes, no es para quien entra con ella.
    const { pagos, totales } = await admin.pagosPorRevisar({
      soloDemostracion: true,
    });
    const [{ reales }] = await fuente.query(
      `SELECT count(*)::int AS reales FROM bookings b
       JOIN users c ON c.id = b."clientId"
       WHERE b.id = ANY($1) AND c."esDemostracion" = false`,
      [pagos.map((pago) => pago.reservaId)],
    );

    expect(mios(pagos).map(({ nombre }) => nombre)).toEqual(['deDemostracion']);
    expect(reales).toBe(0);
    expect(mios(pagos)[0]).toMatchObject({
      cliente: 'Diana R.',
      profesional: 'Dario R.',
    });
    // Y sus totales tampoco cuentan lo real.
    const completos = await admin.pagosPorRevisar();
    expect(totales['retenido-con-reserva-cerrada']).toBe(
      completos.totales['retenido-con-reserva-cerrada'] - 2,
    );
    expect(totales['retenido-sin-completar']).toBe(
      completos.totales['retenido-sin-completar'] - 1,
    );
  });
});
