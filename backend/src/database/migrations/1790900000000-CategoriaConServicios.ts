import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Una categoría con servicios no se puede borrar.
 *
 * La clave de services.categoryId decía ON DELETE SET NULL sobre una columna
 * que no admite null: borrar una categoría con servicios no los dejaba sin
 * categoría, sino que fallaba con un error de la base que llegaba como 500.
 * La API lo comprueba antes y responde 409 con su código; esto lo deja dicho
 * también en la base, que es la última palabra.
 */
const NOMBRE = 'FK_034b52310c2d211bc979c3cc4e8';

/** Las claves de la columna, se llamen como se llamen: ver IntegridadDeLosDatos. */
async function clavesDe(queryRunner: QueryRunner): Promise<string[]> {
  const filas: Array<{ conname: string }> = await queryRunner.query(
    `SELECT c.conname FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f' AND c.conrelid = '"services"'::regclass
       AND a.attname = 'categoryId'`,
  );
  return filas.map((fila) => fila.conname);
}

async function rehacer(
  queryRunner: QueryRunner,
  alBorrar: 'RESTRICT' | 'SET NULL',
): Promise<void> {
  for (const actual of await clavesDe(queryRunner)) {
    await queryRunner.query(
      `ALTER TABLE "services" DROP CONSTRAINT "${actual}"`,
    );
  }
  await queryRunner.query(
    `ALTER TABLE "services" ADD CONSTRAINT "${NOMBRE}" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE ${alBorrar} ON UPDATE NO ACTION`,
  );
}

export class CategoriaConServicios1790900000000 implements MigrationInterface {
  name = 'CategoriaConServicios1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await rehacer(queryRunner, 'RESTRICT');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await rehacer(queryRunner, 'SET NULL');
  }
}
