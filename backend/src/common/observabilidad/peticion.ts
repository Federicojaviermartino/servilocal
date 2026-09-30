import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, LogLevel } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Un identificador por petición, de punta a punta.
 *
 * Cuando algo fallaba, el registro decía qué ruta y qué usuario, pero no qué
 * otras líneas eran de la misma petición: con varias a la vez, las trazas se
 * mezclaban. Y quien veía el error en pantalla no tenía nada que dar para
 * encontrarlo. Ahora cada petición lleva un identificador que sale en todas
 * sus líneas del registro, en Sentry y en la respuesta, y la pantalla de
 * error lo enseña como código de referencia.
 */
export const CABECERA_ID_PETICION = 'x-request-id';

/**
 * Lo que se acepta si llega de fuera. Sin espacios ni saltos de línea: un
 * identificador que los llevara podría fabricar líneas falsas en el
 * registro.
 */
const FORMATO = /^[A-Za-z0-9-]{8,64}$/;

const contexto = new AsyncLocalStorage<{ id: string }>();

/** El identificador de la petición en curso, si la hay. */
export function idPeticionActual(): string | undefined {
  return contexto.getStore()?.id;
}

/** Middleware de Express: asigna el identificador y lo devuelve. */
export function identificarPeticion(
  peticion: Request,
  respuesta: Response,
  siguiente: NextFunction,
): void {
  const recibido = peticion.headers[CABECERA_ID_PETICION];
  const id =
    typeof recibido === 'string' && FORMATO.test(recibido)
      ? recibido
      : randomUUID();

  respuesta.setHeader('X-Request-Id', id);
  contexto.run({ id }, siguiente);
}

/**
 * El registro de Nest, con el identificador de la petición en cada línea
 * que se escriba mientras se atiende. Fuera de una petición —el arranque, las
 * tareas de fondo— la línea sale como siempre.
 */
export class RegistroConPeticion extends ConsoleLogger {
  protected formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
    params?: Record<string, unknown>,
  ): string {
    const id = idPeticionActual();
    return super.formatMessage(
      logLevel,
      message,
      pidMessage,
      formattedLogLevel,
      id ? `${contextMessage}[${id}] ` : contextMessage,
      timestampDiff,
      params,
    );
  }
}

/** Las rutas que se piden solas cada pocos minutos: su éxito no se anota. */
const SIN_ANOTAR_SI_VA_BIEN = new Set([
  '/api/health',
  '/api/v1/health',
  '/api/health/vivo',
  '/api/v1/health/vivo',
]);

/**
 * Una línea por petición, en JSON: método, ruta, estado, lo que tardó y su
 * identificador.
 *
 * El registro solo anotaba los errores del servidor. Quien avisaba de un 401,
 * de un 403 o de que algo iba lento daba su código de referencia y en el
 * registro no había ninguna línea con él. La ruta va sin la consulta, que
 * podría llevar datos de quien pregunta.
 *
 * Se anota al cerrarse la conexión, no al terminar la respuesta: una
 * petición que el cliente abandona —la página que se cierra a mitad de una
 * búsqueda lenta— no llega a terminar, y no dejaba ninguna línea. Justo las
 * lentas, que son las que interesan. Esas salen con `abortada` y, si no se
 * llegó a responder nada, sin estado.
 */
export function anotarPeticion(
  peticion: Request,
  respuesta: Response,
  siguiente: NextFunction,
): void {
  const inicio = process.hrtime.bigint();
  respuesta.once('close', () => {
    const ruta = peticion.originalUrl.split('?')[0];
    const abortada = !respuesta.writableFinished;
    if (
      !abortada &&
      respuesta.statusCode < 400 &&
      SIN_ANOTAR_SI_VA_BIEN.has(ruta)
    ) {
      return;
    }
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    process.stdout.write(
      JSON.stringify({
        tipo: 'peticion',
        metodo: peticion.method,
        ruta,
        estado: respuesta.headersSent ? respuesta.statusCode : null,
        ms: Math.round(ms),
        id: respuesta.getHeader('X-Request-Id'),
        ...(abortada && { abortada: true }),
      }) + '\n',
    );
  });
  siguiente();
}
