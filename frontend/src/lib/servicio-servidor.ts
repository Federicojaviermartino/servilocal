import { cache } from 'react';
import type { Review, Service } from '@/types';
import { apiDelServidor } from './api-servidor';

/**
 * La ficha de un servicio pedida desde el servidor, para el HTML inicial,
 * los metadatos y los datos estructurados.
 *
 * Con cache(), el layout, sus metadatos y la página comparten una sola
 * petición por visita en lugar de hacer tres.
 */

/** Cuánto puede tardar en verse en la ficha un cambio del profesional. */
const FRESCURA_S = 300;

/**
 * Lo que puede pasar al pedir una ficha, que no es lo mismo.
 *
 * Antes las tres cosas devolvían null y la página respondía 200 con el
 * esqueleto: un identificador inventado daba un «no encontrado» que solo
 * aparecía después de hidratar, así que para un buscador era una página
 * válida y vacía. Un 404 blando, y se indexa.
 *
 * Distinguir «no existe» de «no he podido preguntar» es justo lo que importa
 * aquí: responder 404 porque la API está dormida convertiría un apagón de
 * diez minutos en fichas desindexadas.
 */
export type Resultado =
  | { estado: 'ok'; servicio: Service }
  | { estado: 'no-existe' }
  | { estado: 'sin-respuesta' };

/**
 * El identificador como tramo de la ruta, escapado. Llega de la dirección ya
 * descodificado: con ../ dentro, la petición acababa en otra ruta de la API.
 */
const tramo = (id: string) => encodeURIComponent(id);

export const obtenerServicio = cache(async (id: string): Promise<Resultado> => {
  const apiUrl = apiDelServidor();
  if (!apiUrl) return { estado: 'sin-respuesta' };

  try {
    const respuesta = await fetch(`${apiUrl}/services/${tramo(id)}`, {
      signal: AbortSignal.timeout(15000),
      next: { revalidate: FRESCURA_S },
    });
    // Un identificador que no es un UUID también es una ficha que no
    // existe: la API lo rechaza con 400 antes de buscarlo.
    if (respuesta.status === 404 || respuesta.status === 400) {
      return { estado: 'no-existe' };
    }
    if (!respuesta.ok) return { estado: 'sin-respuesta' };
    return { estado: 'ok', servicio: await respuesta.json() };
  } catch {
    // Un fallo de red no debe tumbar el renderizado: se sirve la página
    // igual, y el navegador lo intenta por su cuenta.
    return { estado: 'sin-respuesta' };
  }
});

/** Las valoraciones de un servicio, o null si no se han podido pedir. */
export const obtenerValoraciones = cache(
  async (id: string): Promise<Review[] | null> => {
    const apiUrl = apiDelServidor();
    if (!apiUrl) return null;

    try {
      const respuesta = await fetch(`${apiUrl}/reviews/service/${tramo(id)}`, {
        signal: AbortSignal.timeout(15000),
        next: { revalidate: FRESCURA_S },
      });
      return respuesta.ok ? await respuesta.json() : null;
    } catch {
      return null;
    }
  },
);
