import { MigrationInterface, QueryRunner } from 'typeorm';

export class RegistroAuditoria1789700000000 implements MigrationInterface {
  name = 'RegistroAuditoria1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_accion_enum" AS ENUM('usuario_desactivado', 'usuario_activado', 'reporte_descartado', 'valoracion_eliminada', 'categoria_creada', 'categoria_editada', 'categoria_eliminada')`,
    );

    // Sin clave ajena a users, y a propósito: el correo se copia para que el
    // historial sobreviva al borrado de la cuenta que lo protagonizó.
    await queryRunner.query(
      `CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actorId" uuid NOT NULL,
        "actorEmail" character varying(255) NOT NULL,
        "accion" "public"."audit_logs_accion_enum" NOT NULL,
        "entidad" character varying(40) NOT NULL,
        "entidadId" uuid,
        "contexto" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )`,
    );

    // El registro se lee siempre por fecha descendente, que es como se mira
    // un historial: lo último primero.
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_created" ON "audit_logs" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_created"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_accion_enum"`);
  }
}
