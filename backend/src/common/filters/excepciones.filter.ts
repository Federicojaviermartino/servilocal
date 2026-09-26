import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { Sentry } from '../observabilidad/sentry';
import { idPeticionActual } from '../observabilidad/peticion';

/**
 * Filtro global de excepciones.
 *
 * Dos cosas que antes no ocurrían: los errores no controlados quedan
 * registrados con su contexto (método, ruta y usuario) en lugar de perderse,
 * y se envían a Sentry si está configurado.
 *
 * Los errores esperados (404, 403, validaciones) no se reportan: son parte del
 * funcionamiento normal y solo añadirían ruido.
 */
/**
 * Errores de la base que son culpa de la petición, no del servidor.
 *
 * Un identificador mal formado o un duplicado llegaban como 500: un fallo
 * del servidor que no lo era, con su aviso a Sentry, y que cualquiera podía
 * provocar desde la búsqueda pública con un categoryId cualquiera. Los DTO
 * ya validan los identificadores; esto cubre lo que se les escape, y las
 * carreras que solo la base ve, como dos valoraciones de la misma reserva
 * enviadas a la vez. Los códigos son los de PostgreSQL.
 */
const ERRORES_DE_LA_PETICION: Record<
  string,
  { codigo: HttpStatus; mensaje: string }
> = {
  // invalid_text_representation: un UUID que no lo es, por ejemplo.
  '22P02': {
    codigo: HttpStatus.BAD_REQUEST,
    mensaje: 'Algún dato no tiene el formato esperado.',
  },
  // numeric_value_out_of_range
  '22003': {
    codigo: HttpStatus.BAD_REQUEST,
    mensaje: 'Algún número está fuera del rango admitido.',
  },
  // unique_violation
  '23505': {
    codigo: HttpStatus.CONFLICT,
    mensaje: 'Ya existe un registro con esos datos.',
  },
  // foreign_key_violation
  '23503': {
    codigo: HttpStatus.CONFLICT,
    mensaje: 'La operación choca con otros datos que dependen de estos.',
  },
  // check_violation
  '23514': {
    codigo: HttpStatus.BAD_REQUEST,
    mensaje: 'Algún dato no cumple las reglas.',
  },
};

function errorDeLaPeticion(excepcion: unknown) {
  if (!(excepcion instanceof QueryFailedError)) return null;
  const codigo = (excepcion.driverError as { code?: string } | undefined)?.code;
  return codigo ? (ERRORES_DE_LA_PETICION[codigo] ?? null) : null;
}

@Catch()
export class FiltroDeExcepciones implements ExceptionFilter {
  private readonly logger = new Logger('Excepcion');

  catch(excepcion: unknown, host: ArgumentsHost) {
    const contexto = host.switchToHttp();
    const respuesta = contexto.getResponse<Response>();
    const peticion = contexto.getRequest<Request & { user?: { id: string } }>();

    const esHttp = excepcion instanceof HttpException;
    const deLaPeticion = esHttp ? null : errorDeLaPeticion(excepcion);
    const codigo = esHttp
      ? excepcion.getStatus()
      : (deLaPeticion?.codigo ?? HttpStatus.INTERNAL_SERVER_ERROR);

    const cuerpo = esHttp
      ? excepcion.getResponse()
      : {
          statusCode: codigo,
          message: deLaPeticion?.mensaje ?? 'Error interno del servidor',
        };

    if (codigo >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const detalle =
        excepcion instanceof Error ? excepcion.stack : String(excepcion);
      this.logger.error(
        `${peticion.method} ${peticion.url} -> ${codigo}` +
          (peticion.user ? ` (usuario ${peticion.user.id})` : ''),
        detalle,
      );

      Sentry.withScope((ambito) => {
        ambito.setContext('peticion', {
          metodo: peticion.method,
          ruta: peticion.url,
        });
        if (peticion.user) ambito.setUser({ id: peticion.user.id });
        // El mismo que ve el usuario en pantalla y el que sale en el
        // registro: con él se llega de uno a otro.
        const id = idPeticionActual();
        if (id) ambito.setTag('id_peticion', id);
        Sentry.captureException(excepcion);
      });
    }

    respuesta.status(codigo).json(cuerpo);
  }
}
