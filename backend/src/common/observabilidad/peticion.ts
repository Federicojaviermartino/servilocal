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
