import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La contabilidad de la capa de IA pasa a milésimas de céntimo.
 *
 * En céntimos enteros, una llamada que cuesta cinco centésimas de céntimo se
 * apuntaba como un céntimo: veinte veces su coste. Con el tope de un euro
 * salían unas cien llamadas al mes en lugar de más de mil quinientas, así que
 * el tope no medía lo que decía medir.
 *
 * La unidad sigue siendo entera a propósito: sumar importes pequeños en coma
 * flotante acaba desviando el total. Lo que cambia es la resolución.
 *
 * Los valores existentes se multiplican por mil, que es la misma cantidad de
 * dinero expresada en la unidad nueva. No se pierde nada, aunque tampoco se
 * recupera la precisión que el redondeo anterior ya se había comido.
 */
export class CosteEnMilicentimos1789800000000 implements MigrationInterface {
  name = 'CosteEnMilicentimos1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "uso_ia" RENAME COLUMN "costeCentimos" TO "costeMilicentimos"`,
    );
    await queryRunner.query(
      `UPDATE "uso_ia" SET "costeMilicentimos" = "costeMilicentimos" * 1000`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al volver se redondea hacia arriba, por la misma razón por la que se
    // redondea hacia arriba al contabilizar: nunca conviene decir que se ha
    // gastado menos de lo que se ha gastado.
    await queryRunner.query(
      `UPDATE "uso_ia" SET "costeMilicentimos" = CEIL("costeMilicentimos" / 1000.0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "uso_ia" RENAME COLUMN "costeMilicentimos" TO "costeCentimos"`,
    );
  }
}
