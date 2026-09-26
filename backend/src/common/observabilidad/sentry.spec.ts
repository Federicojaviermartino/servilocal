import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { createTransport } from '@sentry/core';
import {
  iniciarSentry,
  limpiarEvento,
  limpiarTramo,
  opcionesDeSentry,
  Sentry,
} from './sentry';

/**
 * Con el SDK de verdad, no con un doble: lo que se comprueba es qué sale
 * hacia Sentry, y eso lo decide el SDK, que cambia de versión en versión.
 * Pasó al subir a la 11: las trazas dejaron de salir como transacciones y la
 * cookie de sesión volvió a aparecer en los atributos del tramo. Esta prueba
 * se puso en rojo, que es para lo que está.
 *
 * Los testigos se generan al ejecutar. Sentry adjunta líneas del código
 * fuente a cada error, y un testigo escrito aquí aparecería en el envío por
 * esa vía y daría una fuga falsa.
 */
const enviado: string[] = [];
const testigo = randomUUID();
const TOKEN = `eyJ${testigo}.sesion`;
const BEARER = `eyJ${testigo}.bearer`;
const SECRETO = `proxy-${testigo}`;
const CONTRASENA = `clave-${testigo}`;

beforeAll(() => {
  Sentry.init({
    ...opcionesDeSentry('https://clave@o0.ingest.sentry.io/0'),
    // Todas las peticiones, para que siempre haya traza que mirar.
    tracesSampleRate: 1,
    transport: (opciones) =>
      createTransport(opciones, async (peticion) => {
        enviado.push(
          typeof peticion.body === 'string'
            ? peticion.body
            : Buffer.from(peticion.body).toString('utf8'),
        );
        return { statusCode: 200 };
      }),
  });
});

afterAll(() => Sentry.close());

/**
 * Un acceso con todas las credenciales posibles a un servidor que falla: la
 * cookie, el token, el secreto del proxy, la contraseña en el cuerpo y un
 * token en la URL.
 */
async function accesoQueFalla(): Promise<void> {
  // Con require y después de iniciar Sentry: su instrumentación engancha el
  // módulo http al cargarlo.
  const http = createRequire(__filename)('node:http') as typeof import('http');
  const servidor = http.createServer((peticion, respuesta) => {
    peticion.resume();
    peticion.on('end', () => {
      Sentry.captureException(new Error('fallo de prueba'));
      respuesta.statusCode = 500;
      respuesta.end();
    });
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const { port } = servidor.address() as AddressInfo;

  await fetch(`http://127.0.0.1:${port}/auth/login?token=${testigo}`, {
    method: 'POST',
    headers: {
      cookie: `sesion=${TOKEN}; NEXT_LOCALE=es`,
      authorization: `Bearer ${BEARER}`,
      'x-proxy-secreto': SECRETO,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: 'ana@ejemplo.com', password: CONTRASENA }),
  });

  await new Promise<void>((listo) => servidor.close(() => listo()));
  await Sentry.flush(5000);
}

describe('lo que llega a Sentry', () => {
  it('no lleva la sesión, ni el token, ni el secreto, ni la contraseña', async () => {
    await accesoQueFalla();
    const todo = enviado.join('\n');

    // Primero, que de verdad se envió lo que hay que mirar: sin el error, sin
    // el tramo de la petición y sin sus cabeceras, que no apareciera nada no
    // demostraría nada.
    expect(todo).toContain('fallo de prueba');
    expect(todo).toContain('"type":"span"');
    expect(todo).toContain('http.request.header.accept');

    expect(todo).not.toContain(testigo);
  });
});

describe('limpiarEvento', () => {
  it('no se deja nada de la petición del error', () => {
    const evento = limpiarEvento({
      request: {
        cookies: { sesion: TOKEN },
        headers: {
          cookie: `sesion=${TOKEN}`,
          authorization: `Bearer ${BEARER}`,
          'x-proxy-secreto': SECRETO,
          accept: '*/*',
        },
      },
    });

    expect(evento.request).toEqual({ headers: { accept: '*/*' } });
  });

  it('ni de los datos de la traza del error', () => {
    const evento = limpiarEvento({
      contexts: {
        trace: {
          trace_id: 't',
          span_id: 's',
          data: {
            'http.request.header.cookie.sesion': TOKEN,
            'http.request.header.accept': '*/*',
          },
        },
      },
    });

    expect(evento.contexts?.trace?.data).toEqual({
      'http.request.header.accept': '*/*',
    });
  });

  it('un evento sin petición sale igual', () => {
    expect(limpiarEvento({ message: 'hola' })).toEqual({ message: 'hola' });
  });
});

describe('limpiarTramo', () => {
  it('quita las cabeceras con credenciales, en las dos formas de nombrarlas', () => {
    const tramo = limpiarTramo({
      trace_id: 't',
      span_id: 's',
      name: 'POST /auth/login',
      start_timestamp: 0,
      status: 'ok',
      is_segment: true,
      attributes: {
        'http.request.header.cookie': [`sesion=${TOKEN}`],
        'http.request.header.cookie.sesion': TOKEN,
        'http.request.header.authorization': [`Bearer ${BEARER}`],
        'http.request.header.x-proxy-secreto': [SECRETO],
        'http.request.header.x_proxy_secreto': SECRETO,
        'http.response.header.set-cookie': [`sesion=${TOKEN}`],
        'http.request.header.accept': ['*/*'],
        'sentry.op': 'http.server',
      },
    });

    expect(tramo.attributes).toEqual({
      'http.request.header.accept': ['*/*'],
      'sentry.op': 'http.server',
    });
  });
});

describe('opcionesDeSentry', () => {
  const opciones = opcionesDeSentry('https://clave@o0.ingest.sentry.io/0');

  it('limpia los errores y cada tramo', () => {
    expect(opciones.beforeSend).toBe(limpiarEvento);
    expect(opciones.beforeSendSpan).toBe(limpiarTramo);
  });

  it('fija las trazas en flujo, para que una variable no desactive la limpieza', () => {
    // Con SENTRY_TRACE_LIFECYCLE=static, beforeSendSpan dejaría de llamarse.
    expect(opciones.traceLifecycle).toBe('stream');
  });

  it('no recoge cuerpos, cookies, variables locales ni lo que se habla con el asistente', () => {
    // Todo esto lo recoge la versión 11 si no se le dice lo contrario.
    expect(opciones.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });
});

describe('iniciarSentry', () => {
  it('sin DSN no arranca nada ni envía a ningún sitio', () => {
    // En desarrollo y en la integración continua no hay DSN, y no debe
    // salir nada hacia un servicio externo.
    vi.stubEnv('SENTRY_DSN', '');

    expect(iniciarSentry()).toBe(false);
    vi.unstubAllEnvs();
  });
});
