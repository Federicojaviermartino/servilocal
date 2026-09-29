import { DataSource } from 'typeorm';
import { Booking, Category, Review, Service, User } from '../../src/entities';
import { BookingsService } from '../../src/bookings/bookings.service';
import { AdminService } from '../../src/admin/admin.service';
import { crearFuente } from './base';

/**
 * Las cuentas de demostración, contra la base de verdad.
 *
 * Las marca una migración y la semilla, y las separa una consulta que las
 * pruebas unitarias solo ven con dobles. Aquí se comprueba que la marca está
 * donde debe y que una cuenta real no puede reservar con una de
 * demostración.
 */
describe('Cuentas de demostración', () => {
  let fuente: DataSource;
  let reservas: BookingsService;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    reservas = new BookingsService(
      fuente.getRepository(Booking),
      fuente.getRepository(Service),
      fuente.getRepository(User),
      { crear: async () => null } as never,
      {} as never,
      fuente,
      // El historial de la administración no es lo que se prueba aquí.
      { anotar: async () => undefined } as never,
    );
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  it('todas las cuentas sembradas están marcadas, y solo ellas', async () => {
    const [{ sinMarcar }] = await fuente.query(
      `SELECT count(*)::int AS "sinMarcar" FROM users
       WHERE (email LIKE '%@ejemplo.com' OR email = 'demo@servilocal.com')
         AND NOT "esDemostracion"`,
    );
    const [{ marcadas }] = await fuente.query(
      `SELECT count(*)::int AS marcadas FROM users WHERE "esDemostracion"`,
    );

    expect(sinMarcar).toBe(0);
    expect(marcadas).toBeGreaterThan(10);
  });

  it('una cuenta real no puede reservar un servicio de demostración', async () => {
    const [{ id: clienteReal }] = await fuente.query(
      `INSERT INTO users (email, password, "firstName", "lastName", role)
       VALUES ('real-integracion@correo.test', 'x', 'Ana', 'Real', 'client')
       RETURNING id`,
    );
    const [{ id: servicioDemo, priceMin }] = await fuente.query(
      `SELECT s.id, s."priceMin" FROM services s
       JOIN users u ON u.id = s."providerId"
       WHERE u."esDemostracion" AND s."isActive" LIMIT 1`,
    );

    try {
      await expect(
        reservas.create(clienteReal, {
          serviceId: servicioDemo,
          scheduledDate: '2027-06-01T10:00:00Z',
          totalPrice: Number(priceMin),
        } as never),
      ).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({ codigo: 'demostracion' }),
      });

      const [{ total }] = await fuente.query(
        `SELECT count(*)::int AS total FROM bookings WHERE "clientId" = $1`,
        [clienteReal],
      );
      expect(total).toBe(0);
    } finally {
      await fuente.query(`DELETE FROM users WHERE id = $1`, [clienteReal]);
    }
  });

  it('la administración de demostración no ve una reserva del mundo real', async () => {
    // Su contraseña es pública, y la descripción de una reserva es texto
    // libre que la máscara no tapa: desde una valoración denunciada llegaba
    // a la reserva de una cuenta real.
    const [real1, real2] = await fuente.query(
      `INSERT INTO users (email, password, "firstName", "lastName", role)
       VALUES ('real-cliente@correo.test', 'x', 'Ana', 'Real', 'client'),
              ('real-profesional@correo.test', 'x', 'Luis', 'Real', 'provider')
       RETURNING id`,
    );
    const [{ id: servicio, priceMin }] = await fuente.query(
      `SELECT id, "priceMin" FROM services LIMIT 1`,
    );
    const [{ id: reservaReal }] = await fuente.query(
      `INSERT INTO bookings ("clientId", "providerId", "serviceId", "scheduledDate",
                             "durationMinutes", "totalPrice", status, description)
       VALUES ($1, $2, $3, now() + interval '400 days', 60, $4, 'pending',
               'La llave está debajo del felpudo')
       RETURNING id`,
      [real1.id, real2.id, servicio, priceMin],
    );
    const [{ id: reservaDemo }] = await fuente.query(
      `SELECT b.id FROM bookings b
       JOIN users c ON c.id = b."clientId" JOIN users p ON p.id = b."providerId"
       WHERE c."esDemostracion" AND p."esDemostracion" LIMIT 1`,
    );
    const demo = { id: 'demo-admin', role: 'admin', soloLectura: true };

    try {
      await expect(
        reservas.verReserva(reservaReal, demo),
      ).rejects.toMatchObject({ status: 404 });
      // Y la de su mundo sí, que el panel siga funcionando.
      await expect(
        reservas.verReserva(reservaDemo, demo),
      ).resolves.toMatchObject({ id: reservaDemo });
      // La administración de verdad sigue viéndola.
      await expect(
        reservas.verReserva(reservaReal, { id: 'admin', role: 'admin' }),
      ).resolves.toMatchObject({ id: reservaReal });
    } finally {
      await fuente.query(`DELETE FROM bookings WHERE id = $1`, [reservaReal]);
      await fuente.query(`DELETE FROM users WHERE id = ANY($1)`, [
        [real1.id, real2.id],
      ]);
    }
  });

  it('la reputación que ve la administración de demostración es solo de su mundo', async () => {
    const [{ id: real }] = await fuente.query(
      `INSERT INTO users (email, password, "firstName", "lastName", role)
       VALUES ('real-reputacion@correo.test', 'x', 'Luis', 'Real', 'provider')
       RETURNING id`,
    );
    const administracion = new AdminService(
      fuente.getRepository(User),
      fuente.getRepository(Service),
      fuente.getRepository(Booking),
      fuente.getRepository(Review),
      fuente.getRepository(Category),
    );

    try {
      const suya = await administracion.reputacion({ soloDemostracion: true });
      const completa = await administracion.reputacion();

      expect(suya.length).toBeGreaterThan(0);
      expect(suya.map((p) => p.proveedorId)).not.toContain(real);
      // Con el apellido acortado, como en el resto del panel.
      for (const profesional of suya) {
        expect(profesional.nombre).toMatch(/ \p{Lu}\.$/u);
      }
      expect(completa.find((p) => p.proveedorId === real)?.nombre).toBe(
        'Luis Real',
      );
    } finally {
      await fuente.query(`DELETE FROM users WHERE id = $1`, [real]);
    }
  });
});
