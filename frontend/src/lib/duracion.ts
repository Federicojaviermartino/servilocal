/**
 * Cuánto ocupa una reserva en la agenda del profesional.
 *
 * Se escribe con el formato de unidades de cada idioma, sin frases en los
 * catálogos: «1,5 h» en castellano, «1.5 hr» en inglés, «1,5 Std.» en
 * alemán.
 */

/** Las que se ofrecen al publicar un servicio. */
export const DURACIONES = [30, 60, 90, 120, 180, 240, 480];

/** La que tiene un servicio que no dice nada: la misma que pone la base. */
export const DURACION_POR_DEFECTO = 60;

export function formatearDuracion(minutos: number, idioma: string): string {
  if (minutos < 60) {
    return new Intl.NumberFormat(idioma, {
      style: 'unit',
      unit: 'minute',
      unitDisplay: 'short',
    }).format(minutos);
  }
  return new Intl.NumberFormat(idioma, {
    style: 'unit',
    unit: 'hour',
    unitDisplay: 'short',
    maximumFractionDigits: 2,
  }).format(minutos / 60);
}
