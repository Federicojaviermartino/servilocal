import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El índice del orden por fecha, con el identificador detrás.
 *
 * La búsqueda desempata ahora por el identificador: sin él, los servicios
 * creados en el mismo instante cambiaban de sitio entre una página y la
 * siguiente. Con el índice solo sobre la fecha, PostgreSQL tenía que leer
 * todos los que empatan y ordenarlos antes de quedarse con doce. Con 50.000
 * servicios sembrados de mil en mil, la búsqueda amplia por texto pasaba de
 * 15 a 41 milisegundos en la base; con los dos en el índice, 12.
 *
 * El mismo nombre, porque es el mismo índice con una columna más y la
 * entidad lo declara con ese nombre.
 */
export class DesempateDeServiciosRecientes1791300000000 implements MigrationInterface {
  name = 'DesempateDeServiciosRecientes1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_services_creados"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_services_creados" ON "services" ("createdAt", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_services_creados"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_services_creados" ON "services" ("createdAt")`,
    );
  }
}
