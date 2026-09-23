import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { createTransport } from '@sentry/core';
import {
  iniciarSentry,
  limpiarEvento,
  opcionesDeSentry,
  Sentry,
} from './sentry';

/**
 * Con el SDK de verdad, no con un doble: lo que se comprueba es qué sale
 * hacia Sentry, y eso lo decide el SDK, que cambia de versión en versión.
 * Si una actualización empieza a adjuntar las cabeceras en otro sitio, esto
 * se pone en rojo.
 *
 * Los testigos se generan al ejecutar. Sentry adjunta líneas del código
 * fuente a cada error, y un testigo escrito aquí aparecería en el envío por
 * esa vía y daría una fuga falsa.
 */
const enviado: string[] = [];
const testigo = randomUUID();
const TOKEN = `eyJ${testigo}.sesion`;
const BEARER = `eyJ${testigo}.bearer`;

beforeAll(() => {
  Sentry.init({
    ...opcionesDeSentry('https://clave@o0.ingest.sentry.io/0'),
    // Todas las peticiones, para que siempre haya transacción que mirar.
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

/** Una petición con credenciales a un servidor que falla. */
async function peticionQueFalla(): Promise<void> {
  // Con require y después de iniciar Sentry: su instrumentación engancha el
  // módulo http al cargarlo.
  const http = createRequire(__filename)('node:http') as typeof import('http');
  const servidor = http.createServer((_peticion, respuesta) => {
    Sentry.captureException(new Error('fallo de prueba'));
    respuesta.statusCode = 500;
    respuesta.end();
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const { port } = servidor.address() as AddressInfo;

  await fetch(`http://127.0.0.1:${port}/reservas`, {
    headers: {
      cookie: `sesion=${TOKEN}; NEXT_LOCALE=es`,
      authorization: `Bearer ${BEARER}`,
    },
  });

  await new Promise<void>((listo) => servidor.close(() => listo()));
  await Sentry.flush(5000);
}

describe('lo que llega a Sentry', () => {
  it('no lleva ni la cookie de sesión ni el token', async () => {
    await peticionQueFalla();
    const todo = enviado.join('\n');

    // Primero, que de verdad se envió lo que hay que mirar: sin el error y
    // sin la transacción, que no aparezca nada no demostraría nada.
    expect(todo).toContain('fallo de prueba');
    expect(todo).toContain('"type":"transaction"');
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
          accept: '*/*',
        },
      },
    });

    expect(evento.request).toEqual({ headers: { accept: '*/*' } });
  });

  it('ni de los tramos de la transacción', () => {
    const evento = limpiarEvento({
      type: 'transaction',
      contexts: {
        trace: {
          trace_id: 't',
          span_id: 's',
          data: {
            'http.request.header.cookie.sesion': TOKEN,
            'http.request.header.authorization': `Bearer ${BEARER}`,
            'http.request.header.accept': '*/*',
          },
        },
      },
      spans: [
        {
          span_id: 'h',
          trace_id: 't',
          start_timestamp: 0,
          data: { 'http.request.header.cookie.next_locale': 'es' },
        },
      ],
    });

    expect(evento.contexts?.trace?.data).toEqual({
      'http.request.header.accept': '*/*',
    });
    expect(evento.spans?.[0].data).toEqual({});
  });

  it('un evento sin petición sale igual', () => {
    expect(limpiarEvento({ message: 'hola' })).toEqual({ message: 'hola' });
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

  it('las opciones limpian errores y transacciones con lo mismo', () => {
    const opciones = opcionesDeSentry('https://clave@o0.ingest.sentry.io/0');

    expect(opciones.beforeSend).toBe(limpiarEvento);
    expect(opciones.beforeSendTransaction).toBe(limpiarEvento);
  });
});
