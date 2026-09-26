import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La agenda de cada profesional.
 *
 * Una reserva era un instante: no tenía duración, así que dos a la misma
 * hora no se pisaban, y nada impedía confirmar las dos. Ahora cada servicio
 * dice cuánto ocupa, la reserva lo copia al crearse, y la base de datos no
 * deja que dos reservas confirmadas del mismo profesional se solapen.
 *
 * Es una restricción de exclusión y no un índice único porque lo que se
 * compara es si dos intervalos se tocan, y eso lo resuelve GiST. btree_gist
 * le añade la igualdad sobre el identificador del profesional, que GiST no
 * trae de serie. Los intervalos son semiabiertos: una reserva de 10:00 a
 * 11:00 y otra de 11:00 a 12:00 no se pisan.
 */
export class CalendarioReservas1790500000000 implements MigrationInterface {
  name = 'CalendarioReservas1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sin la extensión no hay restricción, pero tampoco se tumba el
    // arranque: la API comprueba el solape al confirmar, y lo único que se
    // pierde es el caso de dos confirmaciones en el mismo instante. El
    // registro lo dice. El punto de retorno no es opcional: una sentencia
    // que falla aborta la transacción entera (ver IndicesDeBusquedaTexto).
    await queryRunner.query(`SAVEPOINT antes_de_btree_gist`);
    let conExtension = true;
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
      await queryRunner.query(`RELEASE SAVEPOINT antes_de_btree_gist`);
    } catch (error) {
      await queryRunner.query(`ROLLBACK TO SAVEPOINT antes_de_btree_gist`);
      conExtension = false;
      console.warn(
        'No se pudo habilitar btree_gist, así que no se crea la restricción ' +
          'que impide solapes. La API los sigue rechazando al confirmar, pero ' +
          'dos confirmaciones simultáneas podrían pasar las dos. Motivo: ' +
          (error as Error).message,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "services" ADD "durationMinutes" integer NOT NULL DEFAULT 60`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "CHK_services_duracion" CHECK ("durationMinutes" BETWEEN 15 AND 480)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "durationMinutes" integer NOT NULL DEFAULT 60`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_duracion" CHECK ("durationMinutes" BETWEEN 15 AND 480)`,
    );

    if (!conExtension) return;

    // Con reservas confirmadas que ya se pisan, la restricción no se puede
    // crear. Tampoco se tumba el arranque por ellas: se dice cuáles, para
    // cancelar una de cada pareja y crear la restricción a mano.
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
        'Hay reservas confirmadas del mismo profesional que se solapan, así ' +
          'que no se crea la restricción que lo impide; la API sigue ' +
          'rechazando los solapes nuevos al confirmar. Cancela una de cada ' +
          'pareja y crea la restricción con la sentencia de ' +
          'CalendarioReservas: ' +
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Puede no existir: la subida no la crea sin la extensión o con solapes.
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "EXCL_bookings_sin_solape"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_duracion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "durationMinutes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" DROP CONSTRAINT "CHK_services_duracion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" DROP COLUMN "durationMinutes"`,
    );
    // btree_gist se queda: quitar una extensión que otra cosa haya empezado
    // a usar rompería más de lo que arregla.
  }
}
