import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { origenesPermitidos } from '../origenes';

/** Métodos que no cambian nada: no hay nada que falsificar con ellos. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Una petición que cambia algo solo se acepta desde un origen conocido.
 *
 * Con la sesión en una cookie, el navegador la manda sola, y eso abre la
 * puerta a que otra web haga que el navegador de alguien pida algo en su
 * nombre. SameSite=Lax ya lo impide en los navegadores actuales; esto es la
 * segunda cerradura, y cubre además lo que Lax no cubre: que otra web meta a
 * alguien en una cuenta ajena enviando un formulario de acceso.
 *
 * CORS no basta para eso. Impide leer la respuesta, pero un formulario
 * enviado desde otra web se ejecuta igual: la respuesta se pierde, el efecto
 * no.
 *
 * Se mira Origin porque el navegador lo pone y ningún script puede cambiarlo.
 * Sin Origin no hay navegador detrás —curl, los scripts, el aviso de
 * Stripe—, y esos no llevan la cookie de nadie: se dejan pasar.
 */
@Injectable()
export class OrigenGuard implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    if (contexto.getType() !== 'http') return true;

    const peticion = contexto.switchToHttp().getRequest<Request>();
    if (METODOS_SEGUROS.has(peticion.method)) return true;

    const origen = peticion.headers.origin;
    if (origen === undefined) return true;
    if (origenesPermitidos().includes(origen)) return true;

    // Swagger, que se sirve desde la propia API. Sec-Fetch-Site también lo
    // pone el navegador y tampoco se puede falsificar desde un script.
    if (peticion.headers['sec-fetch-site'] === 'same-origin') return true;

    throw new ForbiddenException('Origen no permitido');
  }
}
