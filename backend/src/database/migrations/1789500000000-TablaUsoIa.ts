import { MigrationInterface, QueryRunner } from 'typeorm';

export class TablaUsoIa1789500000000 implements MigrationInterface {
  name = 'TablaUsoIa1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Consumo de la capa de IA acumulado por día y funcionalidad. Vive en la
    // base y no en memoria porque la instancia se duerme varias veces al día y
    // un tope de gasto que se reinicia con ella no es un tope.
    await queryRunner.query(`
      CREATE TABLE "uso_ia" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fecha" date NOT NULL,
        "funcionalidad" character varying(60) NOT NULL,
        "llamadas" integer NOT NULL DEFAULT 0,
        "fallos" integer NOT NULL DEFAULT 0,
        "tokensEntrada" bigint NOT NULL DEFAULT 0,
        "tokensSalida" bigint NOT NULL DEFAULT 0,
        "costeCentimos" integer NOT NULL DEFAULT 0,
        "milisegundos" bigint NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_uso_ia" PRIMARY KEY ("id")
      )
    `);

    // La unicidad no es solo integridad: es lo que hace posible el
    // ON CONFLICT DO UPDATE con el que se acumula sin leer antes, y por tanto
    // sin carrera entre dos peticiones simultáneas.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_uso_ia_fecha_funcionalidad" ON "uso_ia" ("fecha", "funcionalidad")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_uso_ia_fecha_funcionalidad"`,
    );
    await queryRunner.query(`DROP TABLE "uso_ia"`);
  }
}
