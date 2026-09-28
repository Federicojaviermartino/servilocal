import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lo que necesita la cuenta para que su titular la gobierne: constancia de
 * los términos aceptados, cerrar las demás sesiones al cambiar la
 * contraseña, recuperarla por correo y eliminar la cuenta.
 */
export class CuentaYPrivacidad1790800000000 implements MigrationInterface {
  name = 'CuentaYPrivacidad1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "terminosAceptadosEn" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "versionTerminos" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "sesionesDesde" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "eliminadaEn" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(`
      CREATE TABLE "restablecimientos_contrasena" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "huella" character varying(64) NOT NULL,
        "caduca" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usadoEn" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_restablecimientos_contrasena" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_restablecimientos_huella" ON "restablecimientos_contrasena" ("huella")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_restablecimientos_usuario" ON "restablecimientos_contrasena" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "restablecimientos_contrasena" ADD CONSTRAINT "FK_restablecimientos_usuario" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Las cuentas se buscan por lower(email): sin índice, cada acceso
    // recorría la tabla. Fuera del alcance de TypeORM, que no ve los
    // índices sobre expresiones, igual que el de la ciudad normalizada.
    await queryRunner.query(
      `CREATE INDEX "IDX_users_email_minusculas" ON "users" (lower("email"))`,
    );

    // Los correos se comparaban distinguiendo mayúsculas: «Ana@» y «ana@»
    // eran cuentas distintas, y quien se registró con una no entraba con la
    // otra. Desde ahora se guardan en minúsculas; los de antes se pasan si
    // no chocan dos entre sí. Si chocan, se dice cuáles y se dejan como
    // están: decidir cuál de las dos sobra no le toca a una migración.
    const choques: Array<{ correo: string }> = await queryRunner.query(`
      SELECT lower(trim("email")) AS correo FROM "users"
      GROUP BY lower(trim("email")) HAVING count(*) > 1
    `);
    if (choques.length > 0) {
      console.warn(
        'Hay cuentas cuyo correo solo se distingue por mayúsculas, así que no ' +
          'se pasan a minúsculas: ' +
          choques.map(({ correo }) => correo).join(', '),
      );
      return;
    }
    await queryRunner.query(
      `UPDATE "users" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los correos se quedan en minúsculas: no hay forma de saber cómo se
    // escribieron, y en minúsculas siguen funcionando.
    await queryRunner.query(`DROP INDEX "public"."IDX_users_email_minusculas"`);
    await queryRunner.query(`DROP TABLE "restablecimientos_contrasena"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "eliminadaEn"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "sesionesDesde"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "versionTerminos"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "terminosAceptadosEn"`,
    );
  }
}
