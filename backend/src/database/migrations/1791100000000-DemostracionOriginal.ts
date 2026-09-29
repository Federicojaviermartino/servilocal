import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una copia de lo público de la demostración, para poder deshacer lo que se
 * cambie en ella.
 *
 * Las contraseñas de las cuentas de demostración están en la pantalla de
 * acceso, y con ellas cualquiera podía reescribir el catálogo que ven todos:
 * cambiar el texto de un servicio por un anuncio, crear otros o dejar una
 * reseña. Prohibirles escribir quitaría lo mejor de la demostración. Se
 * guarda cómo estaba, y una tarea horaria lo devuelve a su sitio (ver
 * DemostracionService).
 *
 * La copia se toma de lo que hay al migrar; después la renueva la semilla.
 * Las expresiones van escritas aquí, y no importadas, para que esta
 * migración siga haciendo lo mismo aunque cambien las de la aplicación.
 */
export class DemostracionOriginal1791100000000 implements MigrationInterface {
  name = 'DemostracionOriginal1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "demostracion_original" (
        "entidad" character varying(20) NOT NULL,
        "id" uuid NOT NULL,
        "datos" jsonb NOT NULL,
        "guardadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_demostracion_original" PRIMARY KEY ("entidad", "id")
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "demostracion_original" ("entidad", "id", "datos")
       SELECT 'servicio', s.id, jsonb_build_object(
         'title', s.title,
         'description', s.description,
         'categoryId', s."categoryId",
         'priceMin', s."priceMin",
         'priceMax', s."priceMax",
         'priceUnit', s."priceUnit",
         'durationMinutes', s."durationMinutes",
         'address', s.address,
         'city', s.city,
         'location', ST_AsGeoJSON(s.location)::jsonb,
         'coverageRadiusKm', s."coverageRadiusKm",
         'images', s.images,
         'isActive', s."isActive",
         'withdrawnAt', s."withdrawnAt"
       )
       FROM services s JOIN users p ON p.id = s."providerId"
       WHERE p."esDemostracion"`,
    );
    await queryRunner.query(
      `INSERT INTO "demostracion_original" ("entidad", "id", "datos")
       SELECT 'usuario', u.id, jsonb_build_object(
         'firstName', u."firstName",
         'lastName', u."lastName",
         'bio', u.bio,
         'avatarUrl', u."avatarUrl",
         'phone', u.phone,
         'city', u.city,
         'address', u.address,
         'postalCode', u."postalCode"
       )
       FROM users u WHERE u."esDemostracion"`,
    );
    await queryRunner.query(
      `INSERT INTO "demostracion_original" ("entidad", "id", "datos")
       SELECT 'valoracion', r.id, jsonb_build_object(
         'providerResponse', r."providerResponse",
         'isReported', r."isReported",
         'reportReason', r."reportReason"
       )
       FROM reviews r JOIN users c ON c.id = r."clientId"
       WHERE c."esDemostracion"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "demostracion_original"`);
  }
}
