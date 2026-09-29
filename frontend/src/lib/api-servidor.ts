/**
 * Dónde encuentra la API el servidor del frontend: el proxy que le reenvía
 * /api, el sitemap y la ficha de un servicio.
 *
 * NEXT_PUBLIC_API_URL es la dirección pública, la que usa el navegador, y
 * se fija al compilar. Casi siempre vale también para el servidor, pero no
 * dentro de docker compose: allí «localhost» es el propio contenedor del
 * frontend, y la API está en otro. API_INTERNA, que se lee al arrancar y no
 * llega nunca al navegador, dice dónde está en ese caso.
 */
export function apiDelServidor(): string | undefined {
  return process.env.API_INTERNA || process.env.NEXT_PUBLIC_API_URL;
}
