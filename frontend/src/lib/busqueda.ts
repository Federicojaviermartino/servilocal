import type { Service, ServiceSearchParams } from '@/types';

/**
 * La búsqueda, como la escribe la dirección y como la entiende la API.
 *
 * La usan el buscador en el navegador y la página que lo sirve desde el
 * servidor, que tienen que leer la misma dirección de la misma forma.
 */

export type Vista = 'list' | 'map';

/**
 * Una lista se pagina; un mapa, no: quien lo abre espera ver todos los
 * resultados del área, no doce de veinticinco. 50 es el máximo que admite la
 * API.
 */
export const LIMITE_MAPA = 50;

/** Lo que se lee de la dirección: un URLSearchParams, en el navegador o no. */
interface Parametros {
  get(clave: string): string | null;
}

/**
 * Las coordenadas van con dos decimales, algo más de un kilómetro: bastan
 * para un radio de búsqueda y no dejan en la dirección, ni en el historial,
 * dónde está la casa de quien busca.
 */
export const redondearCoordenada = (valor: number) =>
  Math.round(valor * 100) / 100;

function coordenada(
  parametros: Parametros,
  clave: string,
  limite: number,
): number | undefined {
  const texto = parametros.get(clave);
  if (texto === null || texto.trim() === '') return undefined;
  const valor = Number(texto);
  return Number.isFinite(valor) && Math.abs(valor) <= limite
    ? redondearCoordenada(valor)
    : undefined;
}

/**
 * Los filtros y la vista viven en la dirección.
 *
 * Solo iban el texto, la categoría y la ciudad, y solo al llegar: los del
 * panel no se escribían nunca, así que buscar un texto nuevo, volver atrás o
 * recargar los perdía, y un enlace no llevaba los filtros que se veían.
 */
export function filtrosDeUrl(parametros: Parametros): ServiceSearchParams {
  const numero = (clave: string) => {
    const valor = Number(parametros.get(clave));
    return Number.isFinite(valor) && valor > 0 ? valor : undefined;
  };
  const latitude = coordenada(parametros, 'lat', 90);
  const longitude = coordenada(parametros, 'lng', 180);
  // El radio solo tiene sentido alrededor de un punto: sin él, la API lo
  // ignora y el filtro no filtraba nada.
  const conPunto = latitude !== undefined && longitude !== undefined;
  return {
    query: parametros.get('q') || undefined,
    categoryId: parametros.get('category') || undefined,
    city: parametros.get('city') || undefined,
    latitude: conPunto ? latitude : undefined,
    longitude: conPunto ? longitude : undefined,
    radiusKm: conPunto ? numero('radius') : undefined,
    minRating: numero('rating'),
    maxPrice: numero('maxPrice'),
  };
}

export function vistaDeUrl(parametros: Parametros): Vista {
  return parametros.get('view') === 'map' ? 'map' : 'list';
}

/**
 * La página de resultados, también en la dirección. Antes vivía solo en la
 * pantalla: quien volvía atrás desde una ficha abierta en la página 3
 * aterrizaba en la 1.
 */
export function paginaDeUrl(parametros: Parametros): number {
  const valor = Number(parametros.get('page'));
  return Number.isInteger(valor) && valor > 1 ? valor : 1;
}

/** La dirección de una búsqueda, siempre en el mismo orden. */
export function urlDeBusqueda(
  filtros: ServiceSearchParams,
  vista: Vista,
  pagina = 1,
): string {
  const parametros = new URLSearchParams();
  if (filtros.query) parametros.set('q', filtros.query);
  if (filtros.categoryId) parametros.set('category', filtros.categoryId);
  if (filtros.city) parametros.set('city', filtros.city);
  if (filtros.latitude !== undefined && filtros.longitude !== undefined) {
    parametros.set('lat', String(redondearCoordenada(filtros.latitude)));
    parametros.set('lng', String(redondearCoordenada(filtros.longitude)));
    if (filtros.radiusKm) parametros.set('radius', String(filtros.radiusKm));
  }
  if (filtros.minRating) parametros.set('rating', String(filtros.minRating));
  if (filtros.maxPrice) parametros.set('maxPrice', String(filtros.maxPrice));
  if (vista === 'map') parametros.set('view', 'map');
  // El mapa no se pagina: enseña todo lo que admite la API.
  else if (pagina > 1) parametros.set('page', String(pagina));
  return parametros.toString();
}

/** Lo que se pide a la API para una búsqueda, una vista y una página. */
export function peticionDeBusqueda(
  filtros: ServiceSearchParams,
  vista: Vista,
  pagina: number,
): ServiceSearchParams {
  return vista === 'map'
    ? { ...filtros, page: 1, limit: LIMITE_MAPA }
    : { ...filtros, page: pagina };
}

/**
 * Los parámetros con los nombres de la API.
 *
 * La API llama priceMax a lo que el buscador llama maxPrice, y rechaza con
 * un 400 cualquier parámetro que no conoce: filtrar por precio máximo
 * dejaba el buscador en error.
 */
export function parametrosDeApi({
  maxPrice,
  ...resto
}: ServiceSearchParams): Record<string, string | number> {
  const parametros: Record<string, string | number> = {};
  for (const [clave, valor] of Object.entries(resto)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      parametros[clave] = valor as string | number;
    }
  }
  if (maxPrice) parametros.priceMax = maxPrice;
  return parametros;
}

/** Lo que llega de una búsqueda, ya en limpio. */
export interface ResultadoBusqueda {
  services: Service[];
  total: number;
  totalEsParcial: boolean;
  totalPages: number;
}

interface RespuestaPaginada {
  data?: Service[];
  total?: number;
  meta?: { total?: number; totalPages?: number; totalEsParcial?: boolean };
}

/** La respuesta de la API, paginada o como lista suelta. */
export function leerBusqueda(
  datos: RespuestaPaginada | Service[],
): ResultadoBusqueda {
  if (Array.isArray(datos)) {
    return {
      services: datos,
      total: datos.length,
      totalEsParcial: false,
      totalPages: 1,
    };
  }
  const services = datos.data ?? [];
  return {
    services,
    total: datos.meta?.total ?? datos.total ?? services.length,
    totalEsParcial: Boolean(datos.meta?.totalEsParcial),
    totalPages: datos.meta?.totalPages ?? 1,
  };
}
