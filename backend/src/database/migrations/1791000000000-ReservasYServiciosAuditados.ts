import { MigrationInterface, QueryRunner } from 'typeorm';

const ACCIONES_ANTERIORES = [
  'usuario_desactivado',
  'usuario_activado',
  'reporte_descartado',
  'valoracion_eliminada',
  'categoria_creada',
  'categoria_editada',
  'categoria_eliminada',
  'pago_cobrado',
  'pago_reembolsado',
];

/**
 * Lo que la administración hace con reservas y servicios, en el historial.
 *
 * Confirmar, completar —que cobra— o cancelar —que suelta el dinero— una
 * reserva ajena, o retirar el servicio de otro, no dejaba rastro, aunque
 * SECURITY.md dice que las acciones de administración quedan anotadas.
 */
export class ReservasYServiciosAuditados1791000000000 implements MigrationInterface {
  name = 'ReservasYServiciosAuditados1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_accion_enum" ADD VALUE 'reserva_cambiada'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_accion_enum" ADD VALUE 'servicio_retirado'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL no quita un valor de un enumerado: se rehace el tipo sin
    // ellos, y las entradas que los usan se van con él.
    await queryRunner.query(
      `DELETE FROM "audit_logs" WHERE "accion" IN ('reserva_cambiada', 'servicio_retirado')`,
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
