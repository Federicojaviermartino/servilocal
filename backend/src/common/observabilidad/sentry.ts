import * as Sentry from '@sentry/node';
import type { Event, NodeOptions } from '@sentry/node';

/** Cabeceras que llevan credenciales: la sesión, el token, el secreto del proxy. */
const CABECERAS_SECRETAS = ['authorization', 'cookie', 'x-proxy-secreto'];

/**
 * Las mismas cabeceras, tal como Sentry las copia en los datos de la traza.
 * Las cookies van una a una: `http.request.header.cookie.sesion`.
 */
const ATRIBUTO_SECRETO =
  /^http\.request\.header\.(authorization|cookie|x_proxy_secreto)(\.|$)/;

function limpiarDatos(datos: Record<string, unknown> | undefined): void {
  if (!datos) return;
  for (const clave of Object.keys(datos)) {
    if (ATRIBUTO_SECRETO.test(clave)) delete datos[clave];
  }
}

/**
 * Quita de lo que se envía a Sentry todo lo que abre una sesión.
 *
 * Se aplica a los errores y también a las transacciones de rendimiento, que
 * era lo que faltaba: beforeSend solo ve los errores, y cada transacción
 * muestreada llevaba las cabeceras de la petición tal cual, token incluido.
 *
 * Sentry tapa algunas por su cuenta, pero decide por el nombre, en inglés:
 * «authorization» la reconoce; una cookie llamada «sesion», no. Y las cookies
 * de los errores las adjunta aparte, en request.cookies, sin filtrar nada.
 * Medido con el SDK de verdad: ver sentry.spec.ts.
 */
export function limpiarEvento<T extends Event>(evento: T): T {
  const peticion = evento.request;
  if (peticion) {
    delete peticion.cookies;
    for (const nombre of CABECERAS_SECRETAS) delete peticion.headers?.[nombre];
  }

  limpiarDatos(evento.contexts?.trace?.data);
  for (const tramo of evento.spans ?? []) limpiarDatos(tramo.data);

  return evento;
}

export function opcionesDeSentry(dsn: string): NodeOptions {
  return {
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Muestreo de trazas de rendimiento. Se deja bajo a propósito: el plan
    // gratuito tiene cupo y lo que interesa aquí son los errores.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    beforeSend: limpiarEvento,
    beforeSendTransaction: limpiarEvento,
  };
}

/**
 * Captura de errores en producción.
 *
 * Solo se activa si hay SENTRY_DSN configurado: sin esa variable el módulo no
 * hace nada, de modo que en desarrollo y en integración continua no se envía
 * nada a ningún servicio externo.
 *
 * Debe llamarse antes de crear la aplicación Nest para que la instrumentación
 * automática alcance a las librerías que se cargan después.
 */
export function iniciarSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init(opcionesDeSentry(dsn));

  return true;
}

export { Sentry };
