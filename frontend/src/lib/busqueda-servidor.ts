import type { ServiceSearchParams } from '@/types';
import { apiDelServidor } from './api-servidor';
import {
  leerBusqueda,
  parametrosDeApi,
  type ResultadoBusqueda,
} from './busqueda';

/** Cuánto puede tardar en verse en el buscador un servicio nuevo. */
const FRESCURA_S = 60;

/**
 * Lo que se espera a la API antes de dejárselo al navegador. Más corto que
 * en la ficha: la página ya está en pantalla y los resultados llegan
 * aparte, pero una API dormida tarda un minuto en despertar, y mientras
 * tanto el navegador puede avisar de ello.
 */
const ESPERA_MS = 8000;

/**
 * La primera página de una búsqueda, pedida desde el servidor.
 *
 * El buscador se pintaba solo en el navegador: el HTML llegaba sin título,
 * sin filtros y sin un solo enlace a una ficha, así que un buscador veía
 * una página vacía y en el móvil lo primero que se veía esperaba al
 * JavaScript y a la API. Ahora esto se pide al servir la página, y el
 * resultado llega por streaming en cuanto la API contesta.
 *
 * null si no ha contestado: entonces lo intenta el navegador.
 */
export async function buscarEnServidor(
  peticion: ServiceSearchParams,
): Promise<ResultadoBusqueda | null> {
  const apiUrl = apiDelServidor();
  if (!apiUrl) return null;

  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametrosDeApi(peticion))) {
    consulta.set(clave, String(valor));
  }

  try {
    const respuesta = await fetch(`${apiUrl}/services/search?${consulta}`, {
      signal: AbortSignal.timeout(ESPERA_MS),
      next: { revalidate: FRESCURA_S },
    });
    return respuesta.ok ? leerBusqueda(await respuesta.json()) : null;
  } catch {
    return null;
  }
}
