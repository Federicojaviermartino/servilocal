import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los pagos de lo que la semilla dejó completado.
 *
 * La semilla creaba las reservas completadas de la demostración sin ningún
 * pago. El panel daba cero euros facturados con todo el trabajo hecho, y la
 * pestaña de pagos por revisar las listaba todas como «completada sin
 * cobrar», que es lo que eran para la base: nadie las había cobrado. Quien
 * entraba a mirar veía una plataforma que no cobra.
 *
 * La semilla ya los crea. Esto es para las bases que se sembraron antes, la
 * de producción entre ellas: a cada reserva completada de la semilla que no
 * tenga pago se le pone uno cobrado, por su importe y con la fecha en que se
 * completó. Sin intención de Stripe, porque no pasó por allí; el resto del
 * código ya trata así un pago que no la tiene.
 *
 * Las tres más recientes se quedan como están. Son el caso que la pestaña
 * existe para enseñar: el profesional la completó sin cobro y su cliente
 * todavía puede pagarla.
 *
 * Solo toca lo sembrado: reservas de cuentas de demostración cuya valoración
 * está en la copia de «demostracion_original». Lo que completara sin cobro
 * quien probaba la demostración sigue en la lista, que es donde tiene que
 * estar, y lo de las cuentas reales ni se mira.
 */
export class PagosDeLaDemostracion1791500000000 implements MigrationInterface {
  name = 'PagosDeLaDemostracion1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ puestos }]: Array<{ puestos: number }> = await queryRunner.query(`
      WITH sembradas AS (
        SELECT b.id, b."clientId", b."totalPrice",
               COALESCE(b."completedAt", b."scheduledDate") AS fecha,
               row_number() OVER (ORDER BY b."scheduledDate" DESC, b.id) AS puesto
        FROM "bookings" b
        JOIN "users" c ON c.id = b."clientId"
        WHERE c."esDemostracion"
          AND b.status = 'completed'
          AND EXISTS (
            SELECT 1 FROM "reviews" r
            JOIN "demostracion_original" d
              ON d.entidad = 'valoracion' AND d.id = r.id
            WHERE r."bookingId" = b.id)
      ), nuevos AS (
        INSERT INTO "payments"
          ("bookingId", "clientId", "amount", "status", "paidAt", "createdAt", "updatedAt")
        SELECT s.id, s."clientId", s."totalPrice", 'completed', s.fecha, s.fecha, s.fecha
        FROM sembradas s
        WHERE s.puesto > 3
          AND s."totalPrice" >= 0.5
          AND NOT EXISTS (
            SELECT 1 FROM "payments" p WHERE p."bookingId" = s.id)
        RETURNING 1
      )
      SELECT count(*)::int AS puestos FROM nuevos
    `);

    // Dicho en el registro: es la única forma de comprobar en producción
    // cuántos se pusieron. En una base vacía no hay nada que decir.
    if (puestos > 0) {
      console.log(
        `Puestos ${puestos} pagos a las reservas completadas de la demostración.`,
      );
    }
  }

  /**
   * No los quita. No hay forma de distinguirlos de los que crea la semilla,
   * y deshacer una migración no es motivo para borrar pagos.
   */
  public async down(): Promise<void> {}
}
