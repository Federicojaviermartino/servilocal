import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un pago por reserva, también en el esquema.
 *
 * Que una reserva tenga un solo pago lo sostenía un bloqueo: abrir el pago
 * bloquea la fila de la reserva, y dos peticiones a la vez acaban en una
 * sola fila. La tabla no decía lo mismo. Un camino nuevo que escribiera un
 * pago sin pasar por ese bloqueo podía dejar dos, que son dos retenciones
 * sobre la misma tarjeta, y el resto del código solo conoce una.
 *
 * El índice que ya había sobre la reserva pasa a ser único, con su mismo
 * nombre.
 *
 * Tolerante, como las demás que dependen de los datos que haya. Si alguna
 * reserva tiene ya dos pagos —pudo pasar antes de que existiera el bloqueo—
 * no tumba el despliegue: lo dice en el registro, con las reservas, y deja
 * el índice como estaba. El bloqueo sigue haciendo su trabajo.
 */
export class UnPagoPorReserva1791400000000 implements MigrationInterface {
  name = 'UnPagoPorReserva1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const repetidas: Array<{ bookingId: string; cuantos: number }> =
      await queryRunner.query(`
        SELECT "bookingId", count(*)::int AS cuantos
        FROM "payments"
        GROUP BY "bookingId"
        HAVING count(*) > 1
      `);
    if (repetidas.length > 0) {
      console.warn(
        'Hay reservas con más de un pago, así que el índice que lo impide no ' +
          'se crea. Deja uno por reserva y créalo con la sentencia de esta ' +
          'migración: ' +
          repetidas
            .map(({ bookingId, cuantos }) => `${bookingId} tiene ${cuantos}`)
            .join('; '),
      );
      return;
    }

    await queryRunner.query(`DROP INDEX "public"."IDX_payments_reserva"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payments_reserva" ON "payments" ("bookingId")`,
    );
    // Dicho en el registro: es la única forma de comprobar en producción
    // que quedó creado.
    console.log('Creado el índice que impide dos pagos de la misma reserva.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_reserva"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_reserva" ON "payments" ("bookingId")`,
    );
  }
}
