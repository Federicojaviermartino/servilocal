import { MigrationInterface, QueryRunner } from 'typeorm';

const ACCIONES_ANTERIORES = [
  'usuario_desactivado',
  'usuario_activado',
  'reporte_descartado',
  'valoracion_eliminada',
  'categoria_creada',
  'categoria_editada',
  'categoria_eliminada',
];

/**
 * Los cobros y reembolsos manuales de la administración, en el historial.
 *
 * Movían dinero sin dejar rastro: si alguien preguntaba por qué se le había
 * devuelto o cobrado un importe, no había forma de saber quién lo hizo.
 */
export class CobrosAuditados1790400000000 implements MigrationInterface {
  name = 'CobrosAuditados1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_accion_enum" ADD VALUE 'pago_cobrado'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_accion_enum" ADD VALUE 'pago_reembolsado'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL no quita un valor de un enumerado: se rehace el tipo sin
    // ellos, y las entradas que los usan se van con él.
    await queryRunner.query(
      `DELETE FROM "audit_logs" WHERE "accion" IN ('pago_cobrado', 'pago_reembolsado')`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_accion_enum" RENAME TO "audit_logs_accion_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_accion_enum" AS ENUM(${ACCIONES_ANTERIORES.map((a) => `'${a}'`).join(', ')})`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "accion" TYPE "public"."audit_logs_accion_enum" USING "accion"::text::"public"."audit_logs_accion_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."audit_logs_accion_enum_old"`);
  }
}
