/**
 * Llena una base de datos con servicios suficientes para que medir signifique
 * algo.
 *
 * La base de desarrollo tiene veinticinco servicios. Con veinticinco filas
 * PostgreSQL recorre la tabla entera más rápido de lo que tardaría en mirar
 * un índice, así que una prueba de carga contra ese volumen mide el marco
 * web y la red, nunca la consulta: se puede borrar el índice espacial y los
 * números salen idénticos. Comprobado, y por eso existe este fichero.
 *
 * Los puntos se reparten alrededor de las ciudades reales con dispersión,
 * porque una nube uniforme sobre la península haría que cualquier búsqueda
 * por cercanía devolviera más o menos lo mismo y tampoco mediría nada.
 *
 * NO usar contra la base de desarrollo ni, por supuesto, contra producción.
 * Pide el destino por variables de entorno y no tiene valores por defecto que
 * apunten a ningún sitio real.
 */
import { createRequire } from 'node:module';

// `pg` es dependencia del servidor, no de la raíz del repositorio, así que se
// resuelve desde allí en vez de desde aquí.
const { Client } = createRequire(
  new URL('../../backend/package.json', import.meta.url),
)('pg');

const CUANTOS = Number(process.env.VOLUMEN || 50000);
const LOTE = 1000;

const CIUDADES = [
  { nombre: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { nombre: 'Barcelona', lat: 41.3874, lng: 2.1686 },
  { nombre: 'Valencia', lat: 39.4699, lng: -0.3763 },
  { nombre: 'Sevilla', lat: 37.3891, lng: -5.9845 },
  { nombre: 'Málaga', lat: 36.7213, lng: -4.4214 },
  { nombre: 'Zaragoza', lat: 41.6488, lng: -0.8891 },
  { nombre: 'Bilbao', lat: 43.263, lng: -2.935 },
  { nombre: 'Murcia', lat: 37.9922, lng: -1.1307 },
];

const OFICIOS = [
  'Reparación de grifos',
  'Instalación de enchufes',
  'Pintura de interiores',
  'Limpieza a fondo',
  'Mudanzas locales',
  'Montaje de muebles',
  'Poda de jardín',
  'Cerrajería de urgencia',
];

// El vocabulario importa tanto como el número de filas. Con ocho títulos
// repetidos, cualquier búsqueda casaba con miles de servicios y el
// planificador hacía bien en recorrer la tabla: ningún índice ayuda cuando el
// resultado es una cuarta parte del catálogo. Eso medía la forma de los datos
// de prueba, no la consulta. Combinando estas piezas salen decenas de miles
// de textos distintos, que es como se parecen los de verdad.
const MATICES = [
  'urgente',
  'con garantía',
  'para comunidades',
  'a domicilio',
  'fin de semana',
  'presupuesto cerrado',
  'obra nueva',
  'reforma integral',
];

const PIEZAS = [
  'grifo monomando',
  'cuadro eléctrico',
  'persiana enrollable',
  'caldera de gas',
  'termo eléctrico',
  'cisterna empotrada',
  'puerta blindada',
  'suelo laminado',
  'toldo de terraza',
  'depósito de agua',
];

const REMATES = [
  'Trabajo garantizado, presupuesto sin compromiso y materiales incluidos.',
  'Más de diez años de experiencia en viviendas y locales comerciales.',
  'Disponibilidad de lunes a sábado, también urgencias por la tarde.',
  'Limpieza del lugar al terminar y factura con todos los conceptos.',
];

function alAzar(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

/** Dispersión de ±0,35 grados, más o menos treinta kilómetros. */
function cerca(valor) {
  return valor + (Math.random() - 0.5) * 0.7;
}

const cliente = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: false,
});

await cliente.connect();

const [{ id: providerId } = {}] = (
  await cliente.query(`SELECT id FROM users WHERE role = 'provider' LIMIT 1`)
).rows;
const [{ id: categoryId } = {}] = (
  await cliente.query(`SELECT id FROM categories LIMIT 1`)
).rows;

if (!providerId || !categoryId) {
  console.error(
    'Hace falta al menos un profesional y una categoría. Ejecuta antes la siembra normal.',
  );
  process.exit(1);
}

const inicio = Date.now();

for (let hecho = 0; hecho < CUANTOS; hecho += LOTE) {
  const cuantos = Math.min(LOTE, CUANTOS - hecho);
  const valores = [];
  const marcadores = [];

  for (let i = 0; i < cuantos; i += 1) {
    const ciudad = alAzar(CIUDADES);
    const lat = cerca(ciudad.lat);
    const lng = cerca(ciudad.lng);
    const base = valores.length;

    valores.push(
      providerId,
      categoryId,
      `${alAzar(OFICIOS)} ${alAzar(MATICES)} ${hecho + i}`,
      `${alAzar(REMATES)} Especialidad en ${alAzar(PIEZAS)} y ` +
        `${alAzar(PIEZAS)}, ${alAzar(MATICES)}.`,
      ciudad.nombre,
      `Calle de prueba ${hecho + i}`,
      20 + Math.floor(Math.random() * 60),
      lng,
      lat,
    );
    marcadores.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},` +
        ` $${base + 6}, $${base + 7}, 'por hora', 10, true,` +
        ` ST_SetSRID(ST_MakePoint($${base + 8}, $${base + 9}), 4326))`,
    );
  }

  await cliente.query(
    `INSERT INTO services
       ("providerId", "categoryId", title, description, city, address,
        "priceMin", "priceUnit", "coverageRadiusKm", "isActive", location)
     VALUES ${marcadores.join(', ')}`,
    valores,
  );

  process.stdout.write(`\r  ${hecho + cuantos} / ${CUANTOS}`);
}

// Sin esto el planificador sigue creyendo que la tabla tiene veinticinco
// filas y elige el plan de antes, que es justo lo que se quería dejar atrás.
await cliente.query('ANALYZE services');

const total = (
  await cliente.query('SELECT count(*)::int AS n FROM services')
).rows[0].n;

console.log(
  `\n${CUANTOS} servicios añadidos en ${((Date.now() - inicio) / 1000).toFixed(1)}s.` +
    ` La tabla tiene ahora ${total}.`,
);

await cliente.end();
