import * as Sentry from '@sentry/node';

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

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Muestreo de trazas de rendimiento. Se deja bajo a propósito: el plan
    // gratuito tiene cupo y lo que interesa aquí son los errores.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    beforeSend(evento) {
      // Nunca se envía la cabecera de autorización ni las cookies: llevan el
      // token de sesión del usuario.
      if (evento.request?.headers) {
        delete evento.request.headers.authorization;
        delete evento.request.headers.cookie;
      }
      return evento;
    },
  });

  return true;
}

export { Sentry };
