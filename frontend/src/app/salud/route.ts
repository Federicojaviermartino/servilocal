/**
 * Qué versión del frontend está sirviendo.
 *
 * La prueba de humo que corre tras cada despliegue espera a ver aquí el
 * commit nuevo antes de comprobar nada: si mirara antes, estaría probando la
 * versión anterior y daría por bueno un despliegue que todavía no ha
 * llegado. RENDER_GIT_COMMIT lo pone Render; fuera de Render no hay versión.
 *
 * Fuera del prefijo de idioma, igual que /api: ver proxy.ts.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      estado: 'ok',
      version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
