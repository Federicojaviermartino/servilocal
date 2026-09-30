import { ForbiddenException } from '@nestjs/common';

/**
 * Lo que tiene que cumplir una cuenta para que su titular la gobierne:
 * aceptar los términos, cambiar y recuperar la contraseña, descargar sus
 * datos y eliminarla. Los rechazos llevan un código para que la interfaz
 * los explique en cada idioma.
 */

/**
 * La versión de los términos y de la política de privacidad que se acepta
 * al registrarse: la fecha de su última actualización. Si cambian, cambia
 * esto, y queda constancia de a qué texto dio conformidad cada cuenta.
 */
export const VERSION_TERMINOS = '2026-09-30';

export const CODIGO_CUENTA_DEMOSTRACION = 'cuenta-de-demostracion';
export const CODIGO_CONTRASENA_INCORRECTA = 'contrasena-incorrecta';
export const CODIGO_ENLACE_NO_VALIDO = 'enlace-no-valido';
export const CODIGO_CUENTA_CON_RESERVAS = 'cuenta-con-reservas-abiertas';
export const CODIGO_CORREO_EN_USO = 'correo-en-uso';
export const CODIGO_CREDENCIALES = 'credenciales-no-validas';
export const CODIGO_CUENTA_DESACTIVADA = 'cuenta-desactivada';

/**
 * El correo tal como se guarda y se busca: sin espacios y en minúsculas.
 * Se comparaba distinguiendo mayúsculas, y quien se registró como «Ana@»
 * no entraba como «ana@».
 */
export function normalizarCorreo(valor: unknown): unknown {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : valor;
}

/**
 * Las cuentas de demostración tienen la contraseña publicada y las usan a
 * la vez muchos visitantes: cambiarla dejaría fuera a todos los demás, y
 * eliminarla rompería la demostración para el siguiente.
 */
export function comprobarQueNoEsDeDemostracion(cuenta: {
  esDemostracion?: boolean;
  soloLectura?: boolean;
}): void {
  if (cuenta.esDemostracion || cuenta.soloLectura) {
    throw new ForbiddenException({
      statusCode: 403,
      codigo: CODIGO_CUENTA_DEMOSTRACION,
      message:
        'Las cuentas de demostración son compartidas: no se puede cambiar su contraseña ni eliminarlas.',
    });
  }
}

/**
 * Ahora, truncado al segundo: la hora de emisión de un token no lleva más
 * precisión, y con milisegundos el token nuevo de quien acaba de cambiar su
 * contraseña parecería anterior al cambio.
 */
export function segundoActual(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}
