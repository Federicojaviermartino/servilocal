import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los servicios por fecha de publicación, que es el orden por defecto del
 * buscador.
 *
 * Una búsqueda por texto que casa con muchos servicios —«grifo» se amplía a
 * toda la fontanería— tenía que comprobar el texto de todos y ordenarlos
 * para quedarse con los doce más recientes: con 50.000 servicios, 1,6
 * segundos de base de datos en cada petición, y más de cinco con treinta
 * personas buscando a la vez. Con el índice, PostgreSQL los recorre ya en
 * orden y para en el duodécimo que casa: 21 milisegundos.
 *
 * Ascendente, aunque se pida del más nuevo al más viejo: un índice B-tree se
 * recorre igual de bien hacia atrás, y así se declara en la entidad, que es
 * lo que compara la integración.
 */
export class IndiceServiciosRecientes1791200000000 implements MigrationInterface {
  name = 'IndiceServiciosRecientes1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_services_creados" ON "services" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_services_creados"`);
  }
}
