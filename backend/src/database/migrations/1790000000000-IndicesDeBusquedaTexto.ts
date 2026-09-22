import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices de trigramas para que la búsqueda por texto deje de recorrer la
 * tabla entera.
 *
 * La búsqueda usa LIKE '%loquesea%' sobre título y descripción. Un patrón que
 * empieza por comodín no puede aprovechar un índice normal, así que cada
 * consulta recorría todas las filas evaluando translate(lower(...)) en cada
 * una. Con veinticinco servicios eso no se nota; con cincuenta mil, el conteo
 * de la paginación —que no lleva LIMIT que lo corte— tardaba 669 ms, y con
 * treinta peticiones a la vez se encolaban hasta doce segundos.
 *
 * pg_trgm parte el texto en grupos de tres letras y los indexa, que es lo que
 * permite a PostgreSQL usar un índice para un patrón con comodín delante. Los
 * índices van sobre la misma expresión normalizada que usa la consulta: sobre
 * la columna a secas no servirían, igual que pasó con el índice espacial.
 *
 * Medido sobre cincuenta mil servicios: 669 ms antes, 18,7 ms después.
 */
export class IndicesDeBusquedaTexto1790000000000 implements MigrationInterface {
  name = 'IndicesDeBusquedaTexto1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_services_titulo_trigramas"
      ON "services" USING gin (
        translate(lower(title), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')
        gin_trgm_ops
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_services_descripcion_trigramas"
      ON "services" USING gin (
        translate(lower(description), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')
        gin_trgm_ops
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_services_descripcion_trigramas"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_services_titulo_trigramas"`,
    );
    // La extensión no se quita: puede haberla instalado otra cosa y
    // desinstalarla se llevaría por delante cualquier índice que dependa de
    // ella.
  }
}
