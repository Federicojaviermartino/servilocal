import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { taparDatosPersonales } from './datos-personales';

/** Métodos que no cambian nada y por tanto siempre se permiten. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Deja mirar, no deja tocar.
 *
 * Es un interceptor y no un guarda por un detalle de orden: los guardas
 * globales de Nest corren ANTES que los de ruta, así que uno global leería
 * request.user cuando AuthGuard('jwt') todavía no lo ha puesto y dejaría
 * pasar absolutamente todo. Los interceptores corren después de los guardas,
 * cuando el usuario ya está resuelto.
 *
 * Y deniega por método, no por una lista de rutas prohibidas: si mañana se
 * añade un endpoint que borra algo, queda bloqueado sin que nadie tenga que
 * acordarse de apuntarlo aquí. Olvidarse es lo normal; que olvidarse sea
 * seguro es el objetivo.
 */
@Injectable()
export class SoloLecturaInterceptor implements NestInterceptor {
  intercept(
    contexto: ExecutionContext,
    siguiente: CallHandler,
  ): Observable<unknown> {
    const peticion = contexto.switchToHttp().getRequest();
    const usuario = peticion?.user;

    if (!usuario?.soloLectura) return siguiente.handle();

    if (!METODOS_SEGUROS.has(peticion.method)) {
      throw new ForbiddenException(
        'Esta es una cuenta de demostración: puedes consultarlo todo, pero no modificar datos.',
      );
    }

    // Consultarlo todo, pero sin datos personales: ver datos-personales.ts.
    return siguiente
      .handle()
      .pipe(map((cuerpo) => taparDatosPersonales(cuerpo, usuario.id)));
  }
}
