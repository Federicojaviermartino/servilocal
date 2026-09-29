import { DataSource } from 'typeorm';
import { DemostracionService } from '../../src/demostracion/demostracion.service';
import { crearFuente } from './base';

/**
 * La demostración que se restaura sola, contra la base de verdad.
 *
 * Todo lo que hace son UPDATE y DELETE con jsonb y PostGIS: con dobles no se
 * comprueba nada. La semilla deja la copia en «demostracion_original»; aquí
 * se estropea lo público como lo estropearía un visitante, con la fecha de
 * modificación de hace dos horas, y se mira que vuelva a su sitio.
 */
describe('Restaurar la demostración', () => {
  let fuente: DataSource;
  let demostracion: DemostracionService;
  const HACE_DOS_HORAS = `now() - interval '2 hours'`;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    demostracion = new DemostracionService(fuente);
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  /** Un servicio sembrado y activo, con lo que se va a comparar. */
  async function servicioSembrado() {
    const [fila] = await fuente.query(
      `SELECT s.id, s.title, s."providerId" FROM services s
       JOIN "demostracion_original" d ON d.entidad = 'servicio' AND d.id = s.id
       WHERE s."withdrawnAt" IS NULL LIMIT 1`,
    );
    return fila as { id: string; title: string; providerId: string };
  }

  it('la semilla deja la copia de lo público de la demostración', async () => {
    const filas: Array<{ entidad: string; n: number }> = await fuente.query(
      `SELECT entidad, count(*)::int AS n FROM "demostracion_original"
       GROUP BY entidad ORDER BY entidad`,
    );
    const cuantas = Object.fromEntries(filas.map((f) => [f.entidad, f.n]));

    expect(cuantas.servicio).toBeGreaterThan(0);
    expect(cuantas.usuario).toBeGreaterThan(0);
    expect(cuantas.valoracion).toBeGreaterThan(0);
  });

  it('un servicio reescrito o retirado hace más de una hora vuelve a su sitio', async () => {
    const servicio = await servicioSembrado();
    await fuente.query(
      `UPDATE services SET title = 'Urgencias: llama al 600 000 000',
         "isActive" = false, "withdrawnAt" = now(),
         "updatedAt" = ${HACE_DOS_HORAS}
       WHERE id = $1`,
      [servicio.id],
    );

    const resumen = await demostracion.restaurar();

    const [ahora] = await fuente.query(
      `SELECT title, "isActive", "withdrawnAt" FROM services WHERE id = $1`,
      [servicio.id],
    );
    expect(ahora).toEqual({
      title: servicio.title,
      isActive: true,
      withdrawnAt: null,
    });
    // Exactamente uno: TypeORM devuelve [filas, recuento] en un UPDATE, y
    // contarlo mal hacía que siempre saliera 2.
    expect(resumen.servicios).toBe(1);
  });

  it('lo cambiado hace menos de una hora se respeta: se está probando', async () => {
    const servicio = await servicioSembrado();
    await fuente.query(
      `UPDATE services SET title = 'Probando la demostración',
         "updatedAt" = now()
       WHERE id = $1`,
      [servicio.id],
    );

    try {
      await demostracion.restaurar();

      const [ahora] = await fuente.query(
        `SELECT title FROM services WHERE id = $1`,
        [servicio.id],
      );
      expect(ahora.title).toBe('Probando la demostración');
    } finally {
      await fuente.query(`UPDATE services SET title = $1 WHERE id = $2`, [
        servicio.title,
        servicio.id,
      ]);
    }
  });

  it('lo que publicó la demostración se borra, o se retira si ya tiene reservas', async () => {
    const servicio = await servicioSembrado();
    const [{ categoryId }] = await fuente.query(
      `SELECT "categoryId" FROM services WHERE id = $1`,
      [servicio.id],
    );
    const nuevo = async (titulo: string): Promise<string> => {
      const [fila] = await fuente.query(
        `INSERT INTO services ("providerId", "categoryId", title, description,
           "priceMin", location, address, city, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'Anuncio', 40, ST_SetSRID(ST_MakePoint(-3.7, 40.4), 4326),
           'Sin dirección', 'Madrid', ${HACE_DOS_HORAS}, ${HACE_DOS_HORAS})
         RETURNING id`,
        [servicio.providerId, categoryId, titulo],
      );
      return fila.id;
    };
    const sinReservas = await nuevo('Anuncio sin reservas');
    const conReservas = await nuevo('Anuncio con reservas');
    const [{ id: cliente }] = await fuente.query(
      `SELECT id FROM users WHERE "esDemostracion" AND role = 'client' LIMIT 1`,
    );
    const [{ id: reserva }] = await fuente.query(
      `INSERT INTO bookings ("clientId", "providerId", "serviceId", "scheduledDate",
         "durationMinutes", "totalPrice", status)
       VALUES ($1, $2, $3, now() + interval '500 days', 60, 40, 'pending')
       RETURNING id`,
      [cliente, servicio.providerId, conReservas],
    );

    try {
      await demostracion.restaurar();

      const filas: Array<{ id: string; retirado: boolean }> =
        await fuente.query(
          `SELECT id, "withdrawnAt" IS NOT NULL AS retirado FROM services
         WHERE id = ANY($1)`,
          [[sinReservas, conReservas]],
        );
      expect(filas).toEqual([{ id: conReservas, retirado: true }]);
    } finally {
      await fuente.query(`DELETE FROM bookings WHERE id = $1`, [reserva]);
      await fuente.query(`DELETE FROM services WHERE id = ANY($1)`, [
        [sinReservas, conReservas],
      ]);
    }
  });

  it('el perfil de una cuenta de demostración vuelve a su sitio', async () => {
    const [cuenta] = await fuente.query(
      `SELECT u.id, u."firstName", u.bio FROM users u
       JOIN "demostracion_original" d ON d.entidad = 'usuario' AND d.id = u.id
       LIMIT 1`,
    );
    await fuente.query(
      `UPDATE users SET "firstName" = 'Oferta', bio = 'Visita mi web',
         "updatedAt" = ${HACE_DOS_HORAS}
       WHERE id = $1`,
      [cuenta.id],
    );

    await demostracion.restaurar();

    const [ahora] = await fuente.query(
      `SELECT "firstName", bio FROM users WHERE id = $1`,
      [cuenta.id],
    );
    expect(ahora).toEqual({ firstName: cuenta.firstName, bio: cuenta.bio });
  });

  it('una reseña que escribió la demostración se borra, y la media se recalcula', async () => {
    // La semilla valora todas sus reservas completadas: se crea una sin
    // valorar, entre dos cuentas de la demostración.
    const servicio = await servicioSembrado();
    const [{ id: cliente }] = await fuente.query(
      `SELECT id FROM users WHERE "esDemostracion" AND role = 'client' LIMIT 1`,
    );
    const [completada] = await fuente.query(
      `INSERT INTO bookings ("clientId", "providerId", "serviceId", "scheduledDate",
         "durationMinutes", "totalPrice", status, "completedAt")
       VALUES ($1, $2, $3, now() - interval '3 days', 60, 40, 'completed',
         now() - interval '3 days')
       RETURNING id, "clientId", "serviceId"`,
      [cliente, servicio.providerId, servicio.id],
    );
    const [antes] = await fuente.query(
      `SELECT "averageRating"::float AS media, "totalReviews" AS total
       FROM services WHERE id = $1`,
      [completada.serviceId],
    );
    await fuente.query(
      `INSERT INTO reviews ("bookingId", "clientId", "serviceId", rating, comment,
         "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 1, 'Reseña falsa', ${HACE_DOS_HORAS}, ${HACE_DOS_HORAS})`,
      [completada.id, completada.clientId, completada.serviceId],
    );
    await fuente.query(
      `UPDATE services SET "averageRating" = 1, "totalReviews" = "totalReviews" + 1
       WHERE id = $1`,
      [completada.serviceId],
    );

    await demostracion.restaurar();

    const [{ n }] = await fuente.query(
      `SELECT count(*)::int AS n FROM reviews WHERE "bookingId" = $1`,
      [completada.id],
    );
    const [despues] = await fuente.query(
      `SELECT "averageRating"::float AS media, "totalReviews" AS total
       FROM services WHERE id = $1`,
      [completada.serviceId],
    );
    await fuente.query(`DELETE FROM bookings WHERE id = $1`, [completada.id]);
    expect(n).toBe(0);
    expect(despues).toEqual(antes);
  });

  it('la respuesta a una reseña sembrada vuelve a ser la que era', async () => {
    const [resena] = await fuente.query(
      `SELECT r.id, r."providerResponse" FROM reviews r
       JOIN "demostracion_original" d ON d.entidad = 'valoracion' AND d.id = r.id
       LIMIT 1`,
    );
    await fuente.query(
      `UPDATE reviews SET "providerResponse" = 'Llámame fuera de la plataforma',
         "updatedAt" = ${HACE_DOS_HORAS}
       WHERE id = $1`,
      [resena.id],
    );

    await demostracion.restaurar();

    const [ahora] = await fuente.query(
      `SELECT "providerResponse" FROM reviews WHERE id = $1`,
      [resena.id],
    );
    expect(ahora.providerResponse).toBe(resena.providerResponse);
  });
});
