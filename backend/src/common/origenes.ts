/**
 * Orígenes que pueden hablar con esta API.
 *
 * Vive aquí porque lo necesitan dos sitios —el servidor HTTP y la pasarela de
 * sockets— y tenerlo escrito dos veces acaba en que uno de los dos se queda
 * atrás. Que fue justo lo que pasó: la pasarela nació aceptando cualquier
 * origen mientras el HTTP ya usaba esta lista.
 */
export function origenesPermitidos(): string[] {
  return (
    process.env.CORS_ORIGINS ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
