import { DataSource } from 'typeorm';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import * as entidades from '../../src/entities';
import { conexionPorUrl } from '../../src/config/conexion-segura';
import { EsquemaInicial1789222453037 } from '../../src/database/migrations/1789222453037-EsquemaInicial';
import { IndiceCiudadNormalizada1789322907859 } from '../../src/database/migrations/1789322907859-IndiceCiudadNormalizada';
import { TablaUsoIa1789500000000 } from '../../src/database/migrations/1789500000000-TablaUsoIa';
import { CuentaSoloLectura1789600000000 } from '../../src/database/migrations/1789600000000-CuentaSoloLectura';
import { AdministradorDemostracion1789600000001 } from '../../src/database/migrations/1789600000001-AdministradorDemostracion';
import { RegistroAuditoria1789700000000 } from '../../src/database/migrations/1789700000000-RegistroAuditoria';
import { CosteEnMilicentimos1789800000000 } from '../../src/database/migrations/1789800000000-CosteEnMilicentimos';
import { IndiceGeografico1789900000000 } from '../../src/database/migrations/1789900000000-IndiceGeografico';
import { IndicesDeBusquedaTexto1790000000000 } from '../../src/database/migrations/1790000000000-IndicesDeBusquedaTexto';
import { SesionesRevocadas1790100000000 } from '../../src/database/migrations/1790100000000-SesionesRevocadas';
import { RenovacionRetenciones1790200000000 } from '../../src/database/migrations/1790200000000-RenovacionRetenciones';
import { CuentasDemostracion1790300000000 } from '../../src/database/migrations/1790300000000-CuentasDemostracion';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

/**
 * Entidades y migraciones como clases, no como rutas.
 *
 * Con rutas, TypeORM carga los ficheros él mismo con el require de Node, que
 * no entiende TypeScript: con Jest funcionaba porque Jest interceptaba ese
 * require, y con Vitest no lo intercepta nadie. Registrar ts-node para que
 * Node sí lo entendiera sería peor: TypeORM tendría su propia copia de cada
 * clase, distinta de la que importan las pruebas, y getRepository(Payment)
 * no encontraría los metadatos de la Payment con la que se le pregunta.
 */
const ENTIDADES = Object.values(entidades).filter(
  // El índice exporta también los enumerados, que no son entidades.
  (exportado) => typeof exportado === 'function',
);

const MIGRACIONES = [
  EsquemaInicial1789222453037,
  IndiceCiudadNormalizada1789322907859,
  TablaUsoIa1789500000000,
  CuentaSoloLectura1789600000000,
  AdministradorDemostracion1789600000001,
  RegistroAuditoria1789700000000,
  CosteEnMilicentimos1789800000000,
  IndiceGeografico1789900000000,
  IndicesDeBusquedaTexto1790000000000,
  SesionesRevocadas1790100000000,
  RenovacionRetenciones1790200000000,
  CuentasDemostracion1790300000000,
];

/**
 * La lista de arriba se escribe a mano, y una migración que se añade al
 * directorio y no a la lista no la vería nadie: la prueba de que todas están
 * aplicadas pasaría, porque TypeORM no sabría que existe. Así que se compara
 * contra el disco, y si falta alguna la integración no arranca.
 */
function comprobarQueNoFaltaNinguna(): void {
  const enDisco = readdirSync(
    resolve(__dirname, '../../src/database/migrations'),
  )
    .filter((fichero) => /^\d+-.+\.ts$/.test(fichero))
    // «1790000000000-IndicesDeBusquedaTexto.ts» es la clase
    // «IndicesDeBusquedaTexto1790000000000».
    .map((fichero) => {
      const [, marca, nombre] = /^(\d+)-(.+)\.ts$/.exec(fichero)!;
      return `${nombre}${marca}`;
    });
  const registradas = new Set(MIGRACIONES.map((migracion) => migracion.name));
  const faltan = enDisco.filter((clase) => !registradas.has(clase));

  if (faltan.length > 0) {
    throw new Error(
      `Hay migraciones en el directorio que base.ts no registra: ${faltan.join(', ')}. ` +
        'Añádelas a MIGRACIONES.',
    );
  }
}

/**
 * Conexión a una base de datos de verdad para las pruebas de integración.
 *
 * Las 362 comprobaciones de la batería normal usan dobles, y eso deja fuera
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
  comprobarQueNoFaltaNinguna();
  const url = process.env.DATABASE_URL;

  const comun = {
    type: 'postgres' as const,
    entities: ENTIDADES,
    migrations: MIGRACIONES,
    synchronize: false,
    logging: false,
  };

  return new DataSource(
    url
      ? {
          ...comun,
          ...conexionPorUrl(url, process.env.DB_SSL_PERMISIVO === 'true'),
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
