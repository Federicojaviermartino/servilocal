import { MigrationInterface, QueryRunner } from 'typeorm';

const TIPOS_ANTERIORES = [
  'booking_request',
  'booking_confirmed',
  'booking_cancelled',
  'booking_completed',
  'new_review',
  'new_message',
  'payment_received',
  'payment_refunded',
  'system',
];

export class RenovacionRetenciones1790200000000 implements MigrationInterface {
  name = 'RenovacionRetenciones1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dónde guarda Stripe la tarjeta de cada cliente: sin ella no se puede
    // renovar una retención sin que el titular esté delante.
    await queryRunner.query(
      `ALTER TABLE "users" ADD "stripeCustomerId" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE 'payment_reauthorization_required'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL no quita un valor de un enumerado: se rehace el tipo sin él.
    await queryRunner.query(
      `DELETE FROM "notifications" WHERE "type" = 'payment_reauthorization_required'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" RENAME TO "notifications_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM(${TIPOS_ANTERIORES.map((t) => `'${t}'`).join(', ')})`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notifications_type_enum" USING "type"::text::"public"."notifications_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "stripeCustomerId"`,
    );
  }
}
