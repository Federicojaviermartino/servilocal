import { DataSource } from 'typeorm';
import { crearFuente } from './base';

/**
 * Lo que solo existe dentro de PostgreSQL.
 *
 * El README afirma cosas concretas sobre el esquema —búsqueda espacial
 * indexada, comparación sin acentos indexable, una valoración por reserva— y
 * ninguna se podía comprobar con un doble, porque un doble hace lo que se le
 * dice. Aquí se le pregunta a la base.
 */
describe('Esquema real', () => {
  let fuente: DataSource;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
  });

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
    // búsqueda indexada. Se fuerza al planificador porque con pocas filas
    // prefiere el escaneo, y hace bien; lo que se comprueba es que el índice
    // está disponible, no cuál elige hoy.
    await fuente.query('SET enable_seqscan = off');
    const plan: { 'QUERY PLAN': string }[] = await fuente.query(
      `EXPLAIN SELECT id FROM services
       WHERE ST_DWithin(
         location::geography,
         ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)::geography,
         10000)`,
    );
    await fuente.query('SET enable_seqscan = on');

    const texto = plan.map((f) => f['QUERY PLAN']).join(' ');
    expect(texto).toContain('IDX_services_location_geography');
    expect(texto).not.toContain('Seq Scan');
  });

  it('la comparación de ciudad sin acentos también', async () => {
    await fuente.query('SET enable_seqscan = off');
    const plan: { 'QUERY PLAN': string }[] = await fuente.query(
      `EXPLAIN SELECT id FROM services
       WHERE translate(lower(city), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')
           = 'malaga'`,
    );
    await fuente.query('SET enable_seqscan = on');

    const texto = plan.map((f) => f['QUERY PLAN']).join(' ');
    expect(texto).toContain('IDX_services_ciudad_normalizada');
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
