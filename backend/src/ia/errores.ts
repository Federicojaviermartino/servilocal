/** Por qué no se pudo usar el modelo. */
export type CausaIa =
  | 'sin-clave'
  | 'apagada'
  | 'presupuesto'
  | 'tiempo'
  | 'credencial'
  | 'proveedor'
  | 'formato';

/**
 * Fallo de la capa de IA.
 *
 * Existe para que un problema del proveedor no viaje como excepción genérica
 * hasta el filtro global, que reporta a Sentry todo lo que sea 500. Un modelo
 * que no responde teniendo camino degradado es funcionamiento normal, no un
 * error interno, y contaminaría el cupo de Sentry sin aportar nada.
 *
 * Nunca lleva el texto del usuario ni la respuesta del proveedor: solo la
 * causa. Así una excepción no puede filtrar a un tercero lo que alguien
 * escribió.
 */
export class ErrorIa extends Error {
  constructor(
    readonly causa: CausaIa,
    readonly detalle?: string,
  ) {
    super(`ia:${causa}`);
    this.name = 'ErrorIa';
  }
}

/** Traduce un fallo del SDK a una causa propia, sin arrastrar su contenido. */
export function causaDesdeError(error: unknown): CausaIa {
  const e = error as { status?: number; name?: string } | undefined;
  if (!e) return 'proveedor';
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'tiempo';
  if (e.status === 401 || e.status === 403) return 'credencial';
  return 'proveedor';
}
