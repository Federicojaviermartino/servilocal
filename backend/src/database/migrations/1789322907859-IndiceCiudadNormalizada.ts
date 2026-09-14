import { MigrationInterface, QueryRunner } from 'typeorm';

export class IndiceCiudadNormalizada1789322907859 implements MigrationInterface {
  name = 'IndiceCiudadNormalizada1789322907859';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El filtro por ciudad compara el valor normalizado (sin mayúsculas ni
    // acentos). Sin este índice funcional, cada búsqueda por ciudad obliga a
    // recorrer la tabla entera. translate() y lower() son IMMUTABLE, así que
    // la expresión es indexable.
    await queryRunner.query(
      `CREATE INDEX "IDX_services_ciudad_normalizada" ON "services" (translate(lower("city"), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_services_ciudad_normalizada"`,
    );
  }
}
