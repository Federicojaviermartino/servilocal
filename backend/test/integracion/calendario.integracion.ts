import { ConflictException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Booking, BookingStatus, Service, User } from '../../src/entities';
import { BookingsService } from '../../src/bookings/bookings.service';
import { crearFuente } from './base';

/**
 * La agenda de un profesional, contra la base de verdad.
 *
 * Que dos reservas confirmadas no se pisen lo decide una restricción de
 * exclusión, y eso solo existe dentro de PostgreSQL: con dobles, la prueba
 * diría lo que el doble quisiera. Aquí se comprueba la restricción, que la
 * API la traduce a un 409 con su código, y que dos confirmaciones a la vez
 * no pasan las dos.
 */
describe('Agenda sin solapes', () => {
  let fuente: DataSource;
  let reservas: BookingsService;
  let servicio: { id: string; providerId: string; priceMin: number };
  let clienteId: string;
  const creadas: string[] = [];

  /** Un día lejano, para no cruzarse con las reservas sembradas. */
  const A_LAS = (hora: number, minuto = 0) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 200);
    fecha.setHours(hora, minuto, 0, 0);
    return fecha;
  };

  async function reserva(
    inicio: Date,
    status: BookingStatus,
    minutos = 60,
    providerId = servicio.providerId,
  ): Promise<string> {
    const [fila] = await fuente.query(
      `INSERT INTO bookings
         ("clientId", "providerId", "serviceId", "scheduledDate",
          "durationMinutes", "totalPrice", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        clienteId,
        providerId,
        servicio.id,
        inicio,
        minutos,
        servicio.priceMin,
        status,
      ],
    );
    creadas.push(fila.id);
    return fila.id;
  }

  const codigoDe = (error: unknown) =>
    (error as QueryFailedError & { driverError?: { code?: string } })
      .driverError?.code;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    reservas = new BookingsService(
      fuente.getRepository(Booking),
      fuente.getRepository(Service),
      fuente.getRepository(User),
      { crear: async () => null } as never,
      {} as never,
      fuente,
    );

    [servicio] = await fuente.query(
      `SELECT s.id, s."providerId", s."priceMin"::float AS "priceMin"
       FROM services s WHERE s."isActive" LIMIT 1`,
    );
    [{ id: clienteId }] = await fuente.query(
      `SELECT id FROM users
       WHERE role = 'client' AND "esDemostracion" AND id <> $1 LIMIT 1`,
      [servicio.providerId],
    );
  });

  afterEach(async () => {
    if (creadas.length > 0) {
      await fuente.query(`DELETE FROM bookings WHERE id = ANY($1)`, [
        creadas.splice(0),
      ]);
    }
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  describe('la restricción de la base', () => {
    it('no deja dos confirmadas del mismo profesional que se pisan', async () => {
      await reserva(A_LAS(10), BookingStatus.CONFIRMED);

      const error = await reserva(A_LAS(10, 30), BookingStatus.CONFIRMED).catch(
        (e: unknown) => e,
      );

      expect(codigoDe(error)).toBe('23P01');
    });

    it('una detrás de otra sí caben: el final no se cuenta', async () => {
      await reserva(A_LAS(10), BookingStatus.CONFIRMED);

      await expect(
        reserva(A_LAS(11), BookingStatus.CONFIRMED),
      ).resolves.toBeTruthy();
    });

    it('la duración cuenta: una de dos horas pisa la siguiente', async () => {
      await reserva(A_LAS(10), BookingStatus.CONFIRMED, 120);

      const error = await reserva(A_LAS(11), BookingStatus.CONFIRMED).catch(
        (e: unknown) => e,
      );

      expect(codigoDe(error)).toBe('23P01');
    });

    it.each([
      BookingStatus.PENDING,
      BookingStatus.CANCELLED,
      BookingStatus.REJECTED,
      BookingStatus.COMPLETED,
    ])('una %s no ocupa la agenda', async (estado) => {
      await reserva(A_LAS(10), estado);

      await expect(
        reserva(A_LAS(10), BookingStatus.CONFIRMED),
      ).resolves.toBeTruthy();
    });

    it('la de otro profesional, tampoco', async () => {
      const [{ id: otro }] = await fuente.query(
        `SELECT "providerId" AS id FROM services WHERE "providerId" <> $1 LIMIT 1`,
        [servicio.providerId],
      );
      await reserva(A_LAS(10), BookingStatus.CONFIRMED, 60, otro);

      await expect(
        reserva(A_LAS(10), BookingStatus.CONFIRMED),
      ).resolves.toBeTruthy();
    });

    it('una duración fuera de los límites no se guarda', async () => {
      const error = await reserva(A_LAS(10), BookingStatus.PENDING, 5).catch(
        (e: unknown) => e,
      );

      expect(codigoDe(error)).toBe('23514');
    });
  });

  describe('a través de la API', () => {
    it('aceptar una que pisa otra confirmada sale como 409 con su código', async () => {
      await reserva(A_LAS(10), BookingStatus.CONFIRMED);
      const pendiente = await reserva(A_LAS(10, 30), BookingStatus.PENDING);

      const error = await reservas
        .updateStatus(pendiente, servicio.providerId, 'provider', {
          status: BookingStatus.CONFIRMED,
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        codigo: 'solape',
      });
    });

    it('dos aceptaciones a la vez: pasa una, y la otra choca', async () => {
      // Cada una bloquea solo su fila, así que ninguna ve a la otra. La
      // restricción sí: hace esperar a la segunda y la rechaza.
      const una = await reserva(A_LAS(10), BookingStatus.PENDING);
      const otra = await reserva(A_LAS(10, 15), BookingStatus.PENDING);

      const resultados = await Promise.allSettled(
        [una, otra].map((id) =>
          reservas.updateStatus(id, servicio.providerId, 'provider', {
            status: BookingStatus.CONFIRMED,
          }),
        ),
      );

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
        1,
      );
      const rechazo = resultados.find((r) => r.status === 'rejected') as
        PromiseRejectedResult | undefined;
      expect(rechazo?.reason).toBeInstanceOf(ConflictException);
    });

    it('pedir un hueco ya comprometido se rechaza al pedirlo', async () => {
      // La consulta compara fechas con parámetros: aquí se ve que la
      // conversión de zona horaria de la ida y la vuelta casa.
      await reserva(A_LAS(10), BookingStatus.CONFIRMED);

      const error = await reservas
        .create(clienteId, {
          serviceId: servicio.id,
          scheduledDate: A_LAS(10, 30).toISOString(),
          totalPrice: servicio.priceMin,
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
    });

    it('y el hueco de al lado sigue libre', async () => {
      await reserva(A_LAS(10), BookingStatus.CONFIRMED);

      const creada = await reservas.create(clienteId, {
        serviceId: servicio.id,
        scheduledDate: A_LAS(11).toISOString(),
        totalPrice: servicio.priceMin,
      });
      creadas.push(creada.id);

      expect(creada.status).toBe(BookingStatus.PENDING);
    });
  });
});
