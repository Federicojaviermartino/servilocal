import * as Sentry from '@sentry/node';
import type { Event, NodeOptions } from '@sentry/node';

/** Cabeceras que llevan credenciales: la sesión, el token, el secreto del proxy. */
const CABECERAS_SECRETAS = ['authorization', 'cookie', 'x-proxy-secreto'];

/**
 * Las mismas cabeceras, tal como Sentry las copia en los atributos de un
 * tramo. Según la versión van enteras (`http.request.header.cookie`) o una
 * cookie por clave (`http.request.header.cookie.sesion`), y con guiones o
 * con guiones bajos.
 */
const ATRIBUTO_SECRETO =
  /^http\.(request|response)\.header\.(authorization|cookie|set[-_]cookie|x[-_]proxy[-_]secreto)(\.|$)/;

/**
 * Lo que no se recoge de las cabeceras ni de la URL: las credenciales, y las
 * direcciones y los usuarios de red que Sentry apartaba por defecto hasta la
 * versión 10. `-ip` se lleva también la del visitante que reenvía el
 * frontend.
 */
const NO_RECOGER = [
  ...CABECERAS_SECRETAS,
  'set-cookie',
  'forwarded',
  '-ip',
  'remote-',
  'via',
  '-user',
  'token',
  'ticket',
];

/**
 * Lo que el SDK recoge por su cuenta.
 *
 * La versión 11 pasó a recogerlo casi todo por defecto: las cookies, los
 * cuerpos de las peticiones —el del acceso lleva la contraseña—, lo que se le
 * escribe al asistente y lo que contesta, los datos de las consultas y las
 * variables locales de cada marco de la pila. Aquí se apaga todo lo que no
 * hace falta para entender un error, que es para lo que está Sentry, y lo que
 * queda se limpia además en beforeSend y en beforeSendSpan.
 */
const RECOGIDA: NonNullable<NodeOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: NO_RECOGER },
    response: { deny: NO_RECOGER },
  },
  httpBodies: [],
  urlQueryParams: { deny: NO_RECOGER },
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

type Tramo = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];

function limpiarDatos(datos: Record<string, unknown> | undefined): void {
  if (!datos) return;
  for (const clave of Object.keys(datos)) {
    if (ATRIBUTO_SECRETO.test(clave)) delete datos[clave];
  }
}

/**
 * Quita de un error todo lo que abre una sesión.
 *
 * Sentry tapa algunas cabeceras por su cuenta, pero decide por el nombre, en
 * inglés: «authorization» la reconoce; una cookie llamada «sesion», no. Y
 * las cookies de los errores las adjuntaba aparte, en request.cookies.
 * Medido con el SDK de verdad: ver sentry.spec.ts.
 */
export function limpiarEvento<T extends Event>(evento: T): T {
  const peticion = evento.request;
  if (peticion) {
    delete peticion.cookies;
    for (const nombre of CABECERAS_SECRETAS) delete peticion.headers?.[nombre];
  }
  limpiarDatos(evento.contexts?.trace?.data);
  return evento;
}

/**
 * Lo mismo para cada tramo de una traza.
 *
 * Desde la versión 11 las trazas no salen como una transacción al terminar
 * la petición, sino tramo a tramo, y beforeSendTransaction ya no se llama:
 * al subir de versión, la cookie de sesión volvía a salir entera en los
 * atributos del tramo de cada petición muestreada. Visto con el SDK de
 * verdad antes de arreglarlo.
 */
export function limpiarTramo(tramo: Tramo): Tramo {
  limpiarDatos(tramo.attributes);
  return tramo;
}

export function opcionesDeSentry(dsn: string): NodeOptions {
  return {
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Muestreo de trazas de rendimiento. Se deja bajo a propósito: el plan
    // gratuito tiene cupo y lo que interesa aquí son los errores.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    // Escrito y no por defecto: SENTRY_TRACE_LIFECYCLE=static devolvería las
    // trazas al modelo de transacciones, donde beforeSendSpan no se llama, y
    // la limpieza de los tramos dejaría de hacerse sin que nada avisara. La
    // opción escrita manda sobre la variable.
    traceLifecycle: 'stream',
    dataCollection: RECOGIDA,
    beforeSend: limpiarEvento,
    beforeSendSpan: limpiarTramo,
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
