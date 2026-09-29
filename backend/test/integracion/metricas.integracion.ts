import { DataSource } from 'typeorm';
import { AdminService } from '../../src/admin/admin.service';
import { Booking, Category, Review, Service, User } from '../../src/entities';
import { crearFuente } from './base';

/**
 * Lo facturado del panel, contra la base de verdad.
 *
 * Sumaba el precio de cada reserva completada, también de las completadas
 * sin cobro y de las reembolsadas. Ahora suma los pagos cobrados, uniendo
 * pagos y reservas: esa unión, con su condición, solo se comprueba de
 * verdad contra PostgreSQL.
 */
describe('Métricas del panel', () => {
  let fuente: DataSource;
  let admin: AdminService;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    admin = new AdminService(
      fuente.getRepository(User),
      fuente.getRepository(Service),
      fuente.getRepository(Booking),
      fuente.getRepository(Review),
      fuente.getRepository(Category),
    );
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  it('lo facturado es lo cobrado: ni lo completado sin cobro ni lo devuelto', async () => {
    const [{ cobrado }] = await fuente.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS cobrado
       FROM payments WHERE status = 'completed'`,
    );

    const metricas = await admin.metricas();

    expect(metricas.reservas.facturado).toBeCloseTo(cobrado, 2);
  });

  it('y unir los pagos no cuenta dos veces ninguna reserva de la serie', async () => {
    const metricas = await admin.metricas();
    const filas: Array<{ semana: string; n: number }> = await fuente.query(
      `SELECT to_char(date_trunc('week', "scheduledDate"), 'YYYY-MM-DD') AS semana,
              count(*)::int AS n
       FROM bookings GROUP BY 1`,
    );
    const porSemana = new Map(filas.map((fila) => [fila.semana, fila.n]));

    for (const punto of metricas.reservas.porSemana) {
      expect(punto.reservas).toBe(porSemana.get(punto.semana) ?? 0);
    }
  });
});
