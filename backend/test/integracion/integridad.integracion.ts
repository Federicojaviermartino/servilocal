import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Booking, Service } from '../../src/entities';
import { ServicesService } from '../../src/services/services.service';
import { crearFuente } from './base';

/**
 * Lo que la base impide aunque la API no llegue a preguntar.
 *
 * Borrar un servicio o una cuenta se llevaba en cascada reservas, pagos y
 * valoraciones: el historial de otras personas. Y las reglas de importes,
 * notas y radios solo vivían en la API, así que un script o una consulta a
 * mano las saltaba. Esto solo se ve contra PostgreSQL.
 */
describe('Integridad de los datos', () => {
  let fuente: DataSource;
  let servicios: ServicesService;
  let reserva: {
    id: string;
    serviceId: string;
    clientId: string;
    providerId: string;
  };

  const codigoDe = (error: unknown) =>
    (error as { driverError?: { code?: string } }).driverError?.code;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    servicios = new ServicesService(
      fuente.getRepository(Service),
      fuente.getRepository(Booking),
    );
    [reserva] = await fuente.query(
      `SELECT id, "serviceId", "clientId", "providerId" FROM bookings
       WHERE status = 'completed' LIMIT 1`,
    );
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  describe('sin cascadas sobre el historial', () => {
    it('un servicio con reservas no se puede borrar a mano', async () => {
      const error = await fuente
        .query(`DELETE FROM services WHERE id = $1`, [reserva.serviceId])
        .catch((e: unknown) => e);

      expect(codigoDe(error)).toBe('23503');
    });

    it('ni una cuenta con reservas', async () => {
      const error = await fuente
        .query(`DELETE FROM users WHERE id = $1`, [reserva.clientId])
        .catch((e: unknown) => e);

      expect(codigoDe(error)).toBe('23503');
    });

    it('ni una reserva con su valoración', async () => {
      const [conValoracion] = await fuente.query(
        `SELECT "bookingId" AS id FROM reviews LIMIT 1`,
      );

      const error = await fuente
        .query(`DELETE FROM bookings WHERE id = $1`, [conValoracion.id])
        .catch((e: unknown) => e);

      expect(codigoDe(error)).toBe('23503');
    });
  });

  describe('eliminar un servicio desde la aplicación', () => {
    it('con historial se retira: deja de verse, y su historial sigue', async () => {
      const antes = await fuente.query(
        `SELECT count(*)::int AS n FROM bookings WHERE "serviceId" = $1`,
        [reserva.serviceId],
      );

      // Transacción deshecha al final: la semilla la usan otras pruebas.
      const consulta = fuente.createQueryRunner();
      await consulta.startTransaction();
      try {
        const aislado = new ServicesService(
          consulta.manager.getRepository(Service),
          consulta.manager.getRepository(Booking),
        );
        await consulta.query(
          `UPDATE bookings SET status = 'completed'
           WHERE "serviceId" = $1 AND status IN ('pending', 'confirmed')`,
          [reserva.serviceId],
        );

        await aislado.remove(reserva.serviceId, reserva.providerId, 'provider');

        const [fila] = await consulta.query(
          `SELECT "isActive", "withdrawnAt" FROM services WHERE id = $1`,
          [reserva.serviceId],
        );
        expect(fila.isActive).toBe(false);
        expect(fila.withdrawnAt).toBeTruthy();
        const despues = await consulta.query(
          `SELECT count(*)::int AS n FROM bookings WHERE "serviceId" = $1`,
          [reserva.serviceId],
        );
        expect(despues[0].n).toBe(antes[0].n);
        await expect(aislado.findById(reserva.serviceId)).rejects.toThrow();
      } finally {
        await consulta.rollbackTransaction();
        await consulta.release();
      }
    });

    it('con reservas abiertas no se elimina', async () => {
      const [abierta] = await fuente.query(
        `SELECT "serviceId", "providerId" FROM bookings
         WHERE status IN ('pending', 'confirmed') LIMIT 1`,
      );

      const error = await servicios
        .remove(abierta.serviceId, abierta.providerId, 'provider')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
    });
  });

  describe('las reglas, también en la base', () => {
    it.each([
      [
        'una nota de seis estrellas',
        `UPDATE reviews SET rating = 6 WHERE id = (SELECT id FROM reviews LIMIT 1)`,
      ],
      [
        'un servicio por debajo de lo que Stripe cobra',
        `UPDATE services SET "priceMin" = 0.1 WHERE id = (SELECT id FROM services LIMIT 1)`,
      ],
      [
        'un radio negativo',
        `UPDATE services SET "coverageRadiusKm" = -5 WHERE id = (SELECT id FROM services LIMIT 1)`,
      ],
      [
        'una reserva de cero euros',
        `UPDATE bookings SET "totalPrice" = 0 WHERE id = (SELECT id FROM bookings LIMIT 1)`,
      ],
    ])('no se guarda %s', async (_caso, sql) => {
      const error = await fuente.query(sql).catch((e: unknown) => e);

      expect(codigoDe(error)).toBe('23514');
    });

    it('en una base limpia quedan validadas, no solo declaradas', async () => {
      // Se crean sin validar para que datos antiguos no tumben el arranque,
      // y después se validan. Aquí no hay datos antiguos que lo impidan.
      const sinValidar = await fuente.query(
        `SELECT conname FROM pg_constraint
         WHERE contype = 'c' AND conname LIKE 'CHK\\_%' AND NOT convalidated`,
      );

      expect(sinValidar).toEqual([]);
    });
  });

  it('las claves ajenas por las que se lista tienen índice', async () => {
    const indices: Array<{ indexname: string }> = await fuente.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const nombres = indices.map((i) => i.indexname);

    for (const esperado of [
      'IDX_bookings_cliente',
      'IDX_bookings_profesional',
      'IDX_bookings_servicio',
      'IDX_payments_reserva',
      'IDX_payments_intencion',
      'IDX_reviews_servicio',
      'IDX_notifications_usuario',
      'IDX_messages_conversacion',
    ]) {
      expect(nombres).toContain(esperado);
    }
  });
});
