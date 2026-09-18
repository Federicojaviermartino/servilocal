/**
 * Convierte la unidad guardada en clave de catálogo.
 *
 * Vive en su propio archivo, sin «use client», porque la necesitan los dos
 * lados: el componente de la tarjeta y el layout que genera los metadatos en
 * el servidor. Importarla desde un módulo de cliente compilaba sin quejarse y
 * devolvía un 500 al pedir la página, que es de los fallos que no se ven
 * hasta que se sirve de verdad.
 *
 * El valor guardado —«por hora», «por dia» sin tilde— es el contrato con la
 * API y no se toca; esto solo decide cómo buscarlo en el catálogo.
 */
export function claveUnidad(unidad: string): string {
  return unidad.trim().toLowerCase().replace(/\s+/g, '-');
}
