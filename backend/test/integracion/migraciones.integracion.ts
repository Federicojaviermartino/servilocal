import { DataSource, type DataSourceOptions } from 'typeorm';
import { crearFuente, idDePrueba, opcionesDeLaBase } from './base';

/**
 * Cada migración se deshace, y la cadena vuelve a aplicarse después.
 *
 * El manual de operaciones da marcha atrás a una versión con
 * `migration:revert`, y eso solo funciona si cada down() deja la base como
 * estaba antes de su up(). Nadie lo comprobaba: la integración aplicaba la
 * cadena hacia delante y nunca la deshacía, y un down() roto se habría
 * descubierto en producción, en mitad de una marcha atrás.
 *
 * En una base aparte, creada y borrada aquí: deshacerlo todo en la de las
 * demás pruebas las dejaría sin tablas.
 */
describe('Migraciones de ida y vuelta', () => {
  const nombre = idDePrueba('migraciones').replace(/-/g, '_');
  let administracion: DataSource;
  let fuente: DataSource;

  /** Las mismas opciones, apuntando a la base temporal. */
  function opcionesTemporales(): DataSourceOptions {
    const base = opcionesDeLaBase() as DataSourceOptions & {
      url?: string;
      database?: string;
    };
    if (!base.url) return { ...base, database: nombre } as DataSourceOptions;
    const url = new URL(base.url);
    url.pathname = `/${nombre}`;
    return { ...base, url: url.toString() } as DataSourceOptions;
  }

  beforeAll(async () => {
    administracion = await crearFuente().initialize();
    await administracion.query(`CREATE DATABASE "${nombre}"`);
    fuente = await new DataSource(opcionesTemporales()).initialize();
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
    if (administracion?.isInitialized) {
      await administracion.query(`DROP DATABASE IF EXISTS "${nombre}"`);
      await administracion.destroy();
    }
  });

  /** Las tablas de la aplicación, sin la de TypeORM ni las de PostGIS. */
  const tablas = async (): Promise<string[]> =>
    (
      await fuente.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name NOT IN ('migrations', 'spatial_ref_sys')
          ORDER BY table_name`,
      )
    ).map((fila: { table_name: string }) => fila.table_name);

  it('se aplican, se deshacen una a una y se vuelven a aplicar', async () => {
    const aplicadas = await fuente.runMigrations({ transaction: 'each' });
    const esquema = await tablas();
    expect(aplicadas.length).toBe(fuente.migrations.length);
    expect(esquema.length).toBeGreaterThan(10);

    for (let i = 0; i < aplicadas.length; i++) {
      await fuente.undoLastMigration({ transaction: 'each' });
    }

    // Todo deshecho: ni una tabla de la aplicación, ni una migración anotada.
    expect(await tablas()).toEqual([]);
    expect(
      await fuente.query(`SELECT count(*)::int AS total FROM migrations`),
    ).toEqual([{ total: 0 }]);

    // Y la cadena vuelve a entrar entera: ningún down() dejó un resto que
    // haga fallar un up() al repetirlo.
    await fuente.runMigrations({ transaction: 'each' });
    expect(await tablas()).toEqual(esquema);
  });
});
