import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Completa lo que CalendarioReservas tuvo que saltarse.
 *
 * En producción había tres reservas de demostración confirmadas que se
 * pisaban, creadas por una prueba automática, y aquella migración, en vez
 * de tumbar el despliegue, no creó la restricción y lo dejó dicho en el
 * registro. Con esas reservas canceladas, esta la crea. Donde
 * CalendarioReservas sí pudo crearla, no hace nada.
 *
 * Es igual de tolerante que aquella, y por lo mismo: si todavía quedan
 * solapes, o la base no tiene btree_gist, lo dice y sigue. La API rechaza
 * los solapes al confirmar también sin la restricción.
 */
export class RestriccionDeSolapes1790700000000 implements MigrationInterface {
  name = 'RestriccionDeSolapes1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existentes: unknown[] = await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'EXCL_bookings_sin_solape'`,
    );
    if (existentes.length > 0) return;

    // El punto de retorno no es opcional: una sentencia que falla aborta la
    // transacción entera (ver IndicesDeBusquedaTexto).
    await queryRunner.query(`SAVEPOINT antes_de_btree_gist`);
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
      await queryRunner.query(`RELEASE SAVEPOINT antes_de_btree_gist`);
    } catch (error) {
      await queryRunner.query(`ROLLBACK TO SAVEPOINT antes_de_btree_gist`);
      console.warn(
        'Sigue sin poder habilitarse btree_gist, así que la restricción que ' +
          'impide solapes no se crea. Motivo: ' +
          (error as Error).message,
      );
      return;
    }

    const solapes: Array<{ una: string; otra: string }> =
      await queryRunner.query(`
        SELECT a.id AS una, b.id AS otra
        FROM "bookings" a
        JOIN "bookings" b
          ON a."providerId" = b."providerId" AND a.id < b.id
        WHERE a.status = 'confirmed' AND b.status = 'confirmed'
          AND tsrange(a."scheduledDate", a."scheduledDate" + a."durationMinutes" * interval '1 minute')
           && tsrange(b."scheduledDate", b."scheduledDate" + b."durationMinutes" * interval '1 minute')
      `);
    if (solapes.length > 0) {
      console.warn(
        'Siguen quedando reservas confirmadas del mismo profesional que se ' +
          'solapan, así que la restricción que lo impide no se crea. Cancela ' +
          'una de cada pareja y créala con la sentencia de esta migración: ' +
          solapes.map(({ una, otra }) => `${una} con ${otra}`).join('; '),
      );
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "bookings" ADD CONSTRAINT "EXCL_bookings_sin_solape"
      EXCLUDE USING gist (
        "providerId" WITH =,
        tsrange("scheduledDate", "scheduledDate" + "durationMinutes" * interval '1 minute') WITH &&
      )
      WHERE (status = 'confirmed')
    `);
    // Dicho en el registro: es la única forma de comprobar en producción
    // que por fin quedó creada.
    console.log(
      'Creada la restricción que impide solapes entre reservas confirmadas.',
    );
  }

  public async down(): Promise<void> {
    // La restricción es de CalendarioReservas, que la quita al revertirse:
    // esta solo la completa donde aquella no pudo. Quitarla aquí la
    // borraría también donde la creó aquella.
  }
}
