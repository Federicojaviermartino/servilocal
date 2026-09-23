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
    // La extensión se intenta, no se exige.
    //
    // Las migraciones corren al arrancar la API, así que una que falla deja
    // el servicio sin levantar. Crear una extensión necesita permisos que el
    // rol de la base gestionada puede no tener, y tumbar la API entera por
    // no poder crear un índice de rendimiento sería perder mucho más de lo
    // que se gana: la búsqueda funciona sin él, solo que recorriendo la
    // tabla.
    //
    // Si no se puede, se dice en el registro y se sigue. Lo que no se hace
    // es fingir que se aplicó: la migración queda marcada, pero el mensaje
    // está ahí para quien vaya a mirar por qué la búsqueda va lenta.
    // El punto de retorno no es opcional: en PostgreSQL, una sentencia que
    // falla aborta la transacción entera, y las migraciones corren dentro de
    // una. Sin él, atrapar el error en JavaScript no sirve de nada —lo
    // siguiente que se intente falla con «current transaction is aborted»,
    // incluida la línea que apunta la migración como aplicada— y el arranque
    // se cae igual. Comprobado: con solo el try/catch, las migraciones
    // seguían terminando con error.
    await queryRunner.query(`SAVEPOINT antes_de_pg_trgm`);
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      await queryRunner.query(`RELEASE SAVEPOINT antes_de_pg_trgm`);
    } catch (error) {
      await queryRunner.query(`ROLLBACK TO SAVEPOINT antes_de_pg_trgm`);
      console.warn(
        'No se pudo habilitar pg_trgm, así que no se crean los índices de ' +
          'trigramas. La búsqueda por texto seguirá recorriendo la tabla. ' +
          'Motivo: ' +
          (error as Error).message,
      );
      return;
    }

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
