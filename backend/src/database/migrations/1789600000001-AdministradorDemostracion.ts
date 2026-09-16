import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la cuenta de administración que se publica en la pantalla de acceso.
 *
 * Va en una migración y no solo en la semilla porque la semilla borra todos
 * los datos antes de escribir: en un entorno desplegado no se puede ejecutar.
 * Sin esto, el botón de la pantalla de acceso existiría en producción y
 * devolvería un 401 al primer visitante que lo pulsara.
 *
 * La contraseña cifrada va escrita aquí a propósito. No es un secreto
 * filtrado: la cuenta es un escaparate, está en solo lectura y la contraseña
 * ya aparece en claro en la propia pantalla de acceso. Cifrarla aquí solo
 * evita tener que encender bcrypt dentro de una migración.
 */
export class AdministradorDemostracion1789600000001 implements MigrationInterface {
  name = 'AdministradorDemostracion1789600000001';

  private readonly email = 'demo@servilocal.com';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "users" ("firstName", "lastName", "email", "password", "role", "isEmailVerified", "soloLectura")
       VALUES ($1, $2, $3, $4, 'admin', true, true)
       ON CONFLICT ("email") DO NOTHING`,
      [
        'Demo',
        'Administración',
        this.email,
        '$2b$10$rElwIXjw84Tetx0CPUaTvOh5HjNicJahev3GMi.XnOgaLEfTX93IO',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "users" WHERE "email" = $1`, [
      this.email,
    ]);
  }
}
