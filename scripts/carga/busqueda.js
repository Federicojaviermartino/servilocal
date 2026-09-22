import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * Cuánto aguanta la búsqueda, que es la consulta cara.
 *
 * El proyecto presumía de búsqueda geográfica indexada sin que nadie hubiera
 * medido nunca nada: ni cuántas peticiones a la vez soporta, ni a partir de
 * qué punto se degrada, ni si el índice espacial sirve de algo bajo carga.
 * «Va rápido» medido abriendo el navegador una vez no es un dato.
 *
 * Se miden los tres caminos por separado porque no cuestan lo mismo: por
 * ciudad es una comparación de texto normalizado, por cercanía es PostGIS
 * calculando distancias, y por texto libre recorre título y descripción.
 *
 * Para ejecutarlo:
 *   docker run --rm -i -e API=http://host.docker.internal:3001/api \
 *     --add-host=host.docker.internal:host-gateway \
 *     grafana/k6 run - < scripts/carga/busqueda.js
 */
const API = __ENV.API || 'http://localhost:3001/api';

const porCiudad = new Trend('busqueda_por_ciudad', true);
const porCercania = new Trend('busqueda_por_cercania', true);
const porTexto = new Trend('busqueda_por_texto', true);

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '30s', target: 30 },
    { duration: '20s', target: 0 },
  ],
  // Los umbrales son el resultado de la prueba, no un adorno: si se pasan,
  // k6 sale con error y la prueba falla.
  //
  // Medido el 22/09/2026 con 50.000 servicios y 30 usuarios a la vez, sobre
  // una máquina de desarrollo:
  //
  //             por cercanía   por ciudad   por texto   caudal
  //   de salida     1,34 s       5,97 s      12,12 s    4,7 req/s
  //   ahora         1,13 s       1,53 s       4,94 s   11,6 req/s
  //
  // Lo que cambió entre una columna y otra: índices de trigramas sobre las
  // expresiones normalizadas, normalizar el patrón en código para que el
  // planificador pueda usarlos, sacar el nombre de la categoría del OR, y
  // acotar el conteo de la paginación.
  //
  // Los topes van por encima de lo medido porque la máquina de la
  // integración es más lenta y porque el margen tiene que absorber su ruido,
  // no tapar una regresión: si la búsqueda por texto vuelve a pasar de ocho
  // segundos, algo se ha deshecho.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<8000'],
    busqueda_por_cercania: ['p(95)<3000'],
    busqueda_por_ciudad: ['p(95)<4000'],
    busqueda_por_texto: ['p(95)<9000'],
  },
};

const CIUDADES = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Malaga'];
const PUNTOS = [
  { lat: 40.4168, lng: -3.7038 },
  { lat: 41.3874, lng: 2.1686 },
  { lat: 39.4699, lng: -0.3763 },
  { lat: 37.3891, lng: -5.9845 },
];
// Mezcla a propósito: unos casan con mucho catálogo y otros con poco. Solo
// con términos comunes se mide el recorrido de la tabla —que es lo que el
// planificador elige, y con razón, cuando el resultado es una cuarta parte de
// todo— y no se vería nunca si los índices sirven de algo.
const TEXTOS = [
  'grifo',
  'blindada',
  'monomando',
  'cisterna',
  'toldo',
  'cerrajeria',
];

function alAzar(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

export default function () {
  const ciudad = http.get(
    `${API}/services/search?city=${alAzar(CIUDADES)}&limit=12`,
  );
  porCiudad.add(ciudad.timings.duration);
  check(ciudad, {
    'por ciudad responde 200': (r) => r.status === 200,
    'por ciudad devuelve una lista': (r) => Array.isArray(r.json('data')),
  });

  const punto = alAzar(PUNTOS);
  const cercania = http.get(
    `${API}/services/search?latitude=${punto.lat}&longitude=${punto.lng}` +
      `&radiusKm=15&sortBy=distance&limit=12`,
  );
  porCercania.add(cercania.timings.duration);
  check(cercania, {
    'por cercanía responde 200': (r) => r.status === 200,
  });

  const texto = http.get(
    `${API}/services/search?query=${alAzar(TEXTOS)}&limit=12`,
  );
  porTexto.add(texto.timings.duration);
  check(texto, {
    'por texto responde 200': (r) => r.status === 200,
  });

  sleep(1);
}
