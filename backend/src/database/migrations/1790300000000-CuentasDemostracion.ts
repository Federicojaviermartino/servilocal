import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca las cuentas de demostración, para aislarlas de las reales.
 *
 * Son las que crea la semilla: todas con correo @ejemplo.com, más la
 * administración de demostración. Se publican con su contraseña, y una
 * cuenta real que interactuara con ellas quedaba a la vista de cualquiera.
 * Ver common/demostracion.ts.
 */
export class CuentasDemostracion1790300000000 implements MigrationInterface {
  name = 'CuentasDemostracion1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "esDemostracion" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "esDemostracion" = true
       WHERE "email" LIKE '%@ejemplo.com' OR "email" = 'demo@servilocal.com'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "esDemostracion"`);
  }
}
