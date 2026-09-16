import { ErrorIa } from '../errores';
import {
  PeticionModelo,
  ProveedorModelo,
  RespuestaModelo,
} from './proveedor-modelo.interface';

/**
 * Proveedor que se inyecta cuando no hay clave o la funcionalidad está apagada.
 *
 * No es un simulador: no devuelve texto falso. Falla de inmediato con una causa
 * concreta para que quien lo llame tome su camino determinista. Un modo
 * simulado que inventa respuestas es peor que no tener nada, porque quien mira
 * la pantalla no distingue lo generado de lo fabricado.
 */
export class ProveedorAusente implements ProveedorModelo {
  readonly disponible = false;
  readonly nombre = 'ninguno';

  constructor(private readonly causa: 'sin-clave' | 'apagada') {}

  completar(_peticion: PeticionModelo): Promise<RespuestaModelo> {
    return Promise.reject(new ErrorIa(this.causa));
  }
}
