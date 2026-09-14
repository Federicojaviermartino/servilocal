import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Sentry } from '../observabilidad/sentry';

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
@Catch()
export class FiltroDeExcepciones implements ExceptionFilter {
  private readonly logger = new Logger('Excepcion');

  catch(excepcion: unknown, host: ArgumentsHost) {
    const contexto = host.switchToHttp();
    const respuesta = contexto.getResponse<Response>();
    const peticion = contexto.getRequest<Request & { user?: { id: string } }>();

    const esHttp = excepcion instanceof HttpException;
    const codigo = esHttp
      ? excepcion.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const cuerpo = esHttp
      ? excepcion.getResponse()
      : { statusCode: codigo, message: 'Error interno del servidor' };

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
        Sentry.captureException(excepcion);
      });
    }

    respuesta.status(codigo).json(cuerpo);
  }
}
