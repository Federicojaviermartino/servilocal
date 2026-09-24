import { MigrationInterface, QueryRunner } from 'typeorm';

export class SesionesRevocadas1790100000000 implements MigrationInterface {
  name = 'SesionesRevocadas1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sesiones cerradas antes de caducar: la API las rechaza aunque la firma
    // del token sea buena. Ver la entidad SesionRevocada.
    await queryRunner.query(`
      CREATE TABLE "sesiones_revocadas" (
        "jti" uuid NOT NULL,
        "caduca" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_sesiones_revocadas" PRIMARY KEY ("jti")
      )
    `);

    // Para borrar las que ya caducaron sin recorrer la tabla entera.
    await queryRunner.query(
      `CREATE INDEX "IDX_sesiones_revocadas_caduca" ON "sesiones_revocadas" ("caduca")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_sesiones_revocadas_caduca"`,
    );
    await queryRunner.query(`DROP TABLE "sesiones_revocadas"`);
  }
}
