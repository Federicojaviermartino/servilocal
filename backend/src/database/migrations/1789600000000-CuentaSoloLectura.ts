import { MigrationInterface, QueryRunner } from 'typeorm';

export class CuentaSoloLectura1789600000000 implements MigrationInterface {
  name = 'CuentaSoloLectura1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // NOT NULL con valor por defecto: las cuentas que ya existen quedan con
    // permisos completos, que es lo que tenían. Una columna nullable dejaría
    // el permiso en manos de un tercer estado que nadie comprueba.
    await queryRunner.query(
      `ALTER TABLE "users" ADD "soloLectura" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "soloLectura"`);
  }
}
