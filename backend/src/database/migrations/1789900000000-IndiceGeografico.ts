import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un índice que la búsqueda por cercanía pueda usar de verdad.
 *
 * Había un índice GiST sobre `location`, que es de tipo geometry. La consulta
 * filtra con `ST_DWithin(location::geography, ...)`, y esa conversión a
 * geography convierte la columna en una expresión distinta: PostgreSQL no
 * puede usar el índice de la columna para una expresión derivada de ella.
 * El plan real lo confirmaba con un Seq Scan sobre la tabla entera.
 *
 * No es lo mismo geometry que geography, y por eso la consulta usa la
 * segunda: sobre geometry, ST_DWithin mide en grados, y un grado son unos
 * 111 km de norte a sur pero unos 80 de este a oeste en la península. El
 * radio en kilómetros que pide el usuario solo significa algo sobre
 * geography, así que lo que se cambia es el índice y no la consulta.
 *
 * Con veinticinco servicios la diferencia no se nota; el escaneo secuencial
 * empieza a doler a partir de unos pocos miles, que es justo cuando ya no se
 * puede desplegar un índice sin pensarlo. El anterior se mantiene: sigue
 * sirviendo para cualquier consulta que trabaje en geometry.
 */
export class IndiceGeografico1789900000000 implements MigrationInterface {
  name = 'IndiceGeografico1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_services_location_geography"
       ON "services" USING gist ((location::geography))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_services_location_geography"`);
  }
}
