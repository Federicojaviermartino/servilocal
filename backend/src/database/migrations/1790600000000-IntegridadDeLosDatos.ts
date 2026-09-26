import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Las claves ajenas que se llevaban el historial por delante. Borrar un
 * servicio borraba en cascada sus reservas, y con ellas los pagos y las
 * valoraciones: el historial de dinero de otras personas desaparecía porque
 * un profesional quitaba un anuncio. Ahora la base lo impide, y el servicio
 * se retira en su lugar (ver ServicesService.remove).
 */
const CLAVES_SIN_CASCADA = [
  ['bookings', 'FK_ea203405627b9fb15023dd75661', 'clientId', 'users'],
  ['bookings', 'FK_15a2431ec10d29dcd96c9563b65', 'serviceId', 'services'],
  ['bookings', 'FK_4f8605bc996f6c39ebd7dbead7b', 'providerId', 'users'],
  ['reviews', 'FK_c357057587a1c2afae453515bf6', 'bookingId', 'bookings'],
  ['reviews', 'FK_8bf30713187361f910f8fb3c2c1', 'clientId', 'users'],
  ['reviews', 'FK_9563540c43639a0669f68e8ebe3', 'serviceId', 'services'],
  ['payments', 'FK_1ead3dc5d71db0ea822706e389d', 'bookingId', 'bookings'],
  ['payments', 'FK_e7c2e95ccd4bd2068c70744dd65', 'clientId', 'users'],
];

/**
 * PostgreSQL no indexa solas las claves ajenas, y cada listado de reservas,
 * pagos, avisos o mensajes filtraba por una recorriendo la tabla entera.
 */
const INDICES = [
  ['IDX_bookings_cliente', 'bookings', '"clientId"'],
  ['IDX_bookings_profesional', 'bookings', '"providerId"'],
  ['IDX_bookings_servicio', 'bookings', '"serviceId"'],
  ['IDX_payments_reserva', 'payments', '"bookingId"'],
  ['IDX_payments_cliente', 'payments', '"clientId"'],
  ['IDX_payments_intencion', 'payments', '"stripePaymentIntentId"'],
  ['IDX_reviews_servicio', 'reviews', '"serviceId"'],
  ['IDX_reviews_cliente', 'reviews', '"clientId"'],
  ['IDX_services_profesional', 'services', '"providerId"'],
  ['IDX_services_categoria', 'services', '"categoryId"'],
  ['IDX_notifications_usuario', 'notifications', '"userId", "createdAt"'],
  ['IDX_conversations_participante_uno', 'conversations', '"participantOneId"'],
  ['IDX_conversations_participante_dos', 'conversations', '"participantTwoId"'],
  ['IDX_messages_conversacion', 'messages', '"conversationId", "createdAt"'],
];

/**
 * Lo que la API ya valida, dicho también en la base, que es la última
 * palabra: un importe por debajo de lo que Stripe cobra, una nota de seis
 * estrellas o un radio negativo no llegan por la API, pero sí por un
 * script o una consulta a mano.
 */
const COMPROBACIONES = [
  ['services', 'CHK_services_precio_minimo', '"priceMin" >= 0.5'],
  [
    'services',
    'CHK_services_precio_maximo',
    '"priceMax" IS NULL OR "priceMax" >= 0.5',
  ],
  ['services', 'CHK_services_radio', '"coverageRadiusKm" BETWEEN 1 AND 100'],
  ['services', 'CHK_services_valoracion', '"averageRating" BETWEEN 0 AND 5'],
  ['bookings', 'CHK_bookings_importe', '"totalPrice" >= 0.5'],
  ['payments', 'CHK_payments_importe', '"amount" >= 0.5'],
  ['reviews', 'CHK_reviews_nota', '"rating" BETWEEN 1 AND 5'],
];

/**
 * Las claves ajenas de una columna, se llamen como se llamen.
 *
 * Los nombres de arriba son los que puso EsquemaInicial, pero esta
 * migración no puede probarse contra la base de producción antes de
 * desplegarla: si alguna se llamara de otra forma, quitarla por su nombre
 * fallaría y el arranque se caería con ella. Se buscan por tabla y columna.
 */
async function clavesDe(
  queryRunner: QueryRunner,
  tabla: string,
  columna: string,
): Promise<string[]> {
  const filas: Array<{ conname: string }> = await queryRunner.query(
    `SELECT c.conname FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f' AND c.conrelid = $1::regclass AND a.attname = $2`,
    [`"${tabla}"`, columna],
  );
  return filas.map((fila) => fila.conname);
}

async function rehacerClave(
  queryRunner: QueryRunner,
  [tabla, nombre, columna, referida]: string[],
  alBorrar: 'RESTRICT' | 'CASCADE',
): Promise<void> {
  for (const actual of await clavesDe(queryRunner, tabla, columna)) {
    await queryRunner.query(
      `ALTER TABLE "${tabla}" DROP CONSTRAINT "${actual}"`,
    );
  }
  await queryRunner.query(
    `ALTER TABLE "${tabla}" ADD CONSTRAINT "${nombre}" FOREIGN KEY ("${columna}") REFERENCES "${referida}"("id") ON DELETE ${alBorrar} ON UPDATE NO ACTION`,
  );
}

export class IntegridadDeLosDatos1790600000000 implements MigrationInterface {
  name = 'IntegridadDeLosDatos1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const clave of CLAVES_SIN_CASCADA) {
      await rehacerClave(queryRunner, clave, 'RESTRICT');
    }

    for (const [nombre, tabla, columnas] of INDICES) {
      await queryRunner.query(
        `CREATE INDEX "${nombre}" ON "${tabla}" (${columnas})`,
      );
    }

    // Sin validar al crearlas: si alguna fila antigua no las cumple, la
    // migración no puede tumbar el arranque por ella. Las filas nuevas y las
    // que se modifiquen sí tienen que cumplirlas. Después se intenta validar
    // cada una; la que no se pueda se queda así, y el registro dice cuál.
    for (const [tabla, nombre, condicion] of COMPROBACIONES) {
      await queryRunner.query(
        `ALTER TABLE "${tabla}" ADD CONSTRAINT "${nombre}" CHECK (${condicion}) NOT VALID`,
      );
      // El punto de retorno no es opcional: una sentencia que falla aborta
      // la transacción entera. Ver IndicesDeBusquedaTexto.
      await queryRunner.query(`SAVEPOINT validar`);
      try {
        await queryRunner.query(
          `ALTER TABLE "${tabla}" VALIDATE CONSTRAINT "${nombre}"`,
        );
        await queryRunner.query(`RELEASE SAVEPOINT validar`);
      } catch (error) {
        await queryRunner.query(`ROLLBACK TO SAVEPOINT validar`);
        console.warn(
          `${nombre} queda sin validar: hay filas antiguas que no la ` +
            `cumplen. Corrígelas y ejecuta ALTER TABLE "${tabla}" VALIDATE ` +
            `CONSTRAINT "${nombre}". Motivo: ${(error as Error).message}`,
        );
      }
    }

    await queryRunner.query(
      `ALTER TABLE "services" ADD "withdrawnAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "withdrawnAt"`);

    for (const [tabla, nombre] of [...COMPROBACIONES].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${tabla}" DROP CONSTRAINT "${nombre}"`,
      );
    }

    for (const [nombre] of [...INDICES].reverse()) {
      await queryRunner.query(`DROP INDEX "public"."${nombre}"`);
    }

    for (const clave of [...CLAVES_SIN_CASCADA].reverse()) {
      await rehacerClave(queryRunner, clave, 'CASCADE');
    }
  }
}
