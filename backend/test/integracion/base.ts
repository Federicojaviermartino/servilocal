import { DataSource } from 'typeorm';
import { resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

/**
 * Conexión a una base de datos de verdad para las pruebas de integración.
 *
 * Las 352 comprobaciones de la batería normal usan dobles, y eso deja fuera
 * todo lo que solo existe dentro de PostgreSQL: si el índice espacial se usa,
 * si el ON CONFLICT acumula en vez de sobrescribir, si el bloqueo de fila
 * serializa dos transacciones, si las migraciones aplican y revierten. Son
 * justo las piezas que este proyecto presume de tener bien, y las que un
 * doble no puede contradecir porque hace lo que se le diga.
 *
 * Usa la misma base que el desarrollo o la que indique DATABASE_URL, y cada
 * prueba limpia lo suyo: no se vacían tablas, porque estas pruebas también se
 * ejecutan contra la base local de alguien que está trabajando.
 */
export function crearFuente(): DataSource {
  const url = process.env.DATABASE_URL;

  const comun = {
    type: 'postgres' as const,
    entities: [resolve(__dirname, '../../src/entities/*.entity{.ts,.js}')],
    migrations: [
      resolve(__dirname, '../../src/database/migrations/*{.ts,.js}'),
    ],
    synchronize: false,
    logging: false,
  };

  return new DataSource(
    url
      ? {
          ...comun,
          url,
          ssl: { rejectUnauthorized: process.env.DB_SSL_PERMISIVO !== 'true' },
        }
      : {
          ...comun,
          host: process.env.DB_HOST ?? 'localhost',
          port: Number(process.env.DB_PORT ?? 5432),
          username: process.env.DB_USERNAME ?? 'servilocal_user',
          password: process.env.DB_PASSWORD ?? 'servilocal_dev_2026',
          database: process.env.DB_DATABASE ?? 'servilocal',
        },
  );
}

/** Identificador irrepetible para no chocar con datos que ya estén. */
export const idDePrueba = (prefijo: string): string =>
  `${prefijo}-${Math.random().toString(36).slice(2, 10)}`;
