import { DataSource } from 'typeorm';
import { Booking, Service, User } from '../../src/entities';
import { BookingsService } from '../../src/bookings/bookings.service';
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
});
