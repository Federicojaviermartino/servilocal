import { DataSource, type DataSourceOptions } from 'typeorm';
import { Booking, Service } from '../../src/entities';
import { ServicesService } from '../../src/services/services.service';
import { crearFuente, opcionesDeLaBase } from './base';

/**
 * Lo que solo existe dentro de PostgreSQL.
 *
 * El README afirma cosas concretas sobre el esquema —búsqueda espacial
 * indexada, comparación sin acentos indexable, una valoración por reserva— y
 * ninguna se podía comprobar con un doble, porque un doble hace lo que se le
 * dice. Aquí se le pregunta a la base.
 */
/** Las llamadas a una función en un SQL, con sus paréntesis equilibrados. */
function extraerLlamadas(sql: string, funcion: string): string[] {
  const llamadas: string[] = [];
  let desde = sql.indexOf(`${funcion}(`);
  while (desde !== -1) {
    let profundidad = 0;
    let fin = desde + funcion.length;
    for (; fin < sql.length; fin++) {
      if (sql[fin] === '(') profundidad++;
      if (sql[fin] === ')' && --profundidad === 0) break;
    }
    llamadas.push(sql.slice(desde, fin + 1));
    desde = sql.indexOf(`${funcion}(`, fin);
  }
  return llamadas;
}

describe('Esquema real', () => {
  let fuente: DataSource;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
  });

  /**
   * La consulta que lanza de verdad la búsqueda con esos filtros, capturada
   * al vuelo y con sus parámetros ya escritos.
   *
   * Y no una escrita a mano: la del índice espacial lo estaba, con un radio
   * fijo, y pasaba en verde mientras la real, con el radio de cada
   * profesional, no podía usar el índice. La prueba de carga lo destapó.
   */
  async function consultaDeLaBusqueda(
    filtros: Record<string, unknown>,
  ): Promise<string> {
    const capturadas: Array<{ sql: string; parametros: unknown[] }> = [];
    const espia = await new DataSource({
      ...opcionesDeLaBase(),
      logging: ['query'],
      logger: {
        logQuery: (sql: string, parametros?: unknown[]) => {
          capturadas.push({ sql, parametros: parametros ?? [] });
        },
        logQueryError: () => undefined,
        logQuerySlow: () => undefined,
        logSchemaBuild: () => undefined,
        logMigration: () => undefined,
        log: () => undefined,
      },
    } as DataSourceOptions).initialize();
    try {
      const servicios = new ServicesService(
        espia.getRepository(Service),
        espia.getRepository(Booking),
        { anotar: async () => undefined } as never,
      );
      await servicios.search(filtros as never);
    } finally {
      await espia.destroy();
    }

    const busqueda = capturadas.find(
      (c) => c.sql.includes('FROM "services"') && !c.sql.includes('COUNT('),
    );
    expect(busqueda, 'la búsqueda lanzó su consulta').toBeTruthy();

    const escribir = (valor: unknown) =>
      typeof valor === 'number'
        ? String(valor)
        : `'${String(valor).replace(/'/g, "''")}'`;
    return busqueda!.sql.replace(/\$(\d+)/g, (_, n: string) =>
      escribir(busqueda!.parametros[Number(n) - 1]),
    );
  }

  /**
   * El plan de una consulta sobre los servicios solos.
   *
   * Se fuerza al planificador porque con las pocas filas de la semilla
   * prefiere recorrer la tabla, y hace bien: lo que se comprueba es que el
   * índice se puede usar, no cuál elige hoy. Y sin las uniones de la
   * consulta entera, con las que puede preferir otro índice igual de bueno.
   */
  async function planDe(resto: string): Promise<string> {
    await fuente.query('SET enable_seqscan = off');
    try {
      const plan: { 'QUERY PLAN': string }[] = await fuente.query(
        `EXPLAIN SELECT "service"."id" FROM "services" "service" ${resto}`,
      );
      return plan.map((f) => f['QUERY PLAN']).join(' ');
    } finally {
      await fuente.query('SET enable_seqscan = on');
    }
  }

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  it('todas las migraciones están aplicadas', async () => {
    // Si alguien añade una migración y no la ejecuta, el resto de estas
    // comprobaciones fallaría por un motivo confuso. Mejor decirlo aquí.
    const pendientes = await fuente.showMigrations();

    expect(pendientes).toBe(false);
  });

  it('PostGIS está instalado', async () => {
    const [fila] = await fuente.query(
      `SELECT extname FROM pg_extension WHERE extname = 'postgis'`,
    );

    expect(fila?.extname).toBe('postgis');
  });

  it('la búsqueda por cercanía puede usar un índice', async () => {
    // Había un índice GiST sobre la columna geometry y la consulta filtra
    // sobre su conversión a geography, que para PostgreSQL es otra expresión:
    // el plan real era un escaneo secuencial mientras el README presumía de
    // búsqueda indexada.
    const consulta = await consultaDeLaBusqueda({
      latitude: 40.4168,
      longitude: -3.7038,
      radiusKm: 15,
      sortBy: 'distance',
    });

    // Sus condiciones de cercanía, tal cual.
    const condiciones = extraerLlamadas(consulta, 'ST_DWithin');
    expect(condiciones).toHaveLength(2);

    expect(await planDe(`WHERE ${condiciones.join(' AND ')}`)).toContain(
      'IDX_services_location_geography',
    );
  });

  /** Las comparaciones sobre una columna normalizada: sin acentos ni mayúsculas. */
  const sobre = (consulta: string, columna: string) =>
    extraerLlamadas(consulta, 'translate').filter((llamada) =>
      llamada.startsWith(`translate(lower("service"."${columna}")`),
    );

  it('la comparación de ciudad sin acentos también', async () => {
    const consulta = await consultaDeLaBusqueda({ city: 'Málaga' });
    const [expresion] = sobre(consulta, 'city');
    expect(expresion, 'la búsqueda compara la ciudad').toBeTruthy();

    // La expresión de la consulta real y lo que le sigue: con qué la compara.
    const desde = consulta.indexOf(expresion);
    const comparacion = /^\s*=\s*'[^']*'/.exec(
      consulta.slice(desde + expresion.length),
    );
    expect(comparacion, 'compara por igualdad').toBeTruthy();

    expect(await planDe(`WHERE ${expresion}${comparacion![0]}`)).toContain(
      'IDX_services_ciudad_normalizada',
    );
  });

  it.each([
    ['title', 'IDX_services_titulo_trigramas'],
    ['description', 'IDX_services_descripcion_trigramas'],
  ])('la búsqueda por texto en %s puede usar %s', async (columna, indice) => {
    // Un LIKE con comodín delante no lo sirve un índice normal: lo sirven
    // los de trigramas, y solo si la expresión es letra por letra la suya.
    const consulta = await consultaDeLaBusqueda({ query: 'grifo' });
    const [expresion] = sobre(consulta, columna);
    expect(expresion, `la búsqueda mira ${columna}`).toBeTruthy();

    const desde = consulta.indexOf(expresion);
    const comparacion = /^\s*LIKE\s*'[^']*'/.exec(
      consulta.slice(desde + expresion.length),
    );
    expect(comparacion, 'compara con LIKE').toBeTruthy();

    expect(await planDe(`WHERE ${expresion}${comparacion![0]}`)).toContain(
      indice,
    );
  });

  it('el orden por defecto se lee del índice, sin ordenar nada', async () => {
    // Los más recientes primero, con su desempate. El índice sobre la fecha
    // y el identificador los da ya en ese orden, y PostgreSQL para en el
    // duodécimo. Con el desempate en el otro sentido, o sin el
    // identificador en el índice, tendría que ordenar: con 50.000 servicios
    // era la diferencia entre 12 milisegundos y 41.
    const consulta = await consultaDeLaBusqueda({});
    const orden = /ORDER BY (.+?) LIMIT/.exec(consulta);
    expect(orden, 'la búsqueda ordena').toBeTruthy();

    const plan = await planDe(`ORDER BY ${orden![1]} LIMIT 12`);

    expect(plan).toContain('IDX_services_creados');
    expect(plan).not.toContain('Sort');
  });

  it('una reserva no puede tener dos valoraciones', async () => {
    // Es lo que sostiene que las notas vengan de trabajos hechos. Se
    // comprueba que la restricción existe en la base, no que el código la
    // respete: el código se puede saltar, la restricción no.
    const indices = await fuente.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'reviews'`,
    );

    const texto = indices
      .map((i: { indexdef: string }) => i.indexdef)
      .join(' ');
    expect(texto).toMatch(/UNIQUE INDEX.*bookingId/);
  });

  it('el consumo de IA es único por día y funcionalidad', async () => {
    // Sin esa unicidad, el ON CONFLICT del acumulador no tendría contra qué
    // chocar y cada llamada insertaría una fila nueva en vez de sumar.
    const indices = await fuente.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'uso_ia'`,
    );

    const texto = indices
      .map((i: { indexdef: string }) => i.indexdef)
      .join(' ');
    expect(texto).toMatch(/UNIQUE INDEX.*fecha.*funcionalidad/);
  });

  it('el historial de auditoría no depende de la tabla de usuarios', async () => {
    // Una clave ajena con borrado en cascada haría desaparecer la anotación
    // justo al borrar la cuenta que la protagonizó.
    const claves = await fuente.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'audit_logs'::regclass AND contype = 'f'`,
    );

    expect(claves).toEqual([]);
  });

  it('las entidades y las migraciones describen el mismo esquema', async () => {
    // Una columna que se añade a una entidad sin su migración pasa todas las
    // pruebas con dobles y falla al desplegar, con la primera consulta que
    // la nombre. TypeORM sabe decir qué cambiaría para que la base coincida
    // con las entidades: tiene que ser nada. Los índices llevan en la
    // entidad el mismo nombre que en su migración por esto mismo; sin él,
    // TypeORM inventa uno y cree que el de la base sobra.
    const { upQueries } = await fuente.driver.createSchemaBuilder().log();

    expect(upQueries.map((consulta) => consulta.query)).toEqual([]);
  });
});
