/**
 * Cómo se conecta por TLS a una base de datos dada por URL.
 *
 * Quien decide si se verifica el certificado es el código, no la URL. Hasta
 * ahora el código pasaba ssl: { rejectUnauthorized } y la URL de Neon
 * llevaba sslmode=require, y en node-postgres lo que dice la URL pisa lo que
 * dice el código: con sslmode=no-verify en la URL y el código pidiendo
 * verificar, el certificado no se verifica. Comprobado.
 *
 * Hoy sslmode=require se trata como verificación completa, así que no había
 * agujero. Pero pg avisa en cada arranque de que en su próxima versión mayor
 * require pasará a significar lo que en libpq: cifrar sin verificar. Esa
 * subida la propondría Dependabot, pasaría todas las pruebas —ninguna conecta
 * a un servidor con certificado falso— y la conexión de producción quedaría
 * expuesta a un intermediario sin que nada lo dijera.
 *
 * Así que se quitan de la URL los parámetros que deciden el TLS, y queda el
 * del código como única fuente. La excepción es sslmode=disable, que no dice
 * cuánto verificar sino si hay TLS, y solo tiene sentido contra una base
 * local: se respeta.
 *
 * Solo se toca lo que va detrás del «?». Usuario, contraseña y servidor no
 * se vuelven a codificar, porque reescribir una contraseña con caracteres
 * especiales es la forma más tonta de romper una conexión que funcionaba.
 */

/** Todo lo que node-postgres convierte en configuración de TLS. */
const DECIDE_EL_TLS = /^(ssl.*|uselibpqcompat)$/i;

export interface ConexionPorUrl {
  url: string;
  ssl: false | { rejectUnauthorized: boolean };
}

/**
 * La URL sin los parámetros de TLS, y el TLS que dice el código.
 *
 * @param permisivo si es true no se verifica el certificado; es lo que
 *   activa DB_SSL_PERMISIVO, para proveedores con certificado autofirmado.
 */
export function conexionPorUrl(
  url: string,
  permisivo: boolean,
): ConexionPorUrl {
  const interrogacion = url.indexOf('?');
  if (interrogacion === -1) {
    return { url, ssl: { rejectUnauthorized: !permisivo } };
  }

  const antes = url.slice(0, interrogacion);
  const parametros = new URLSearchParams(url.slice(interrogacion + 1));

  const sinTls = parametros.get('sslmode')?.toLowerCase() === 'disable';

  for (const clave of [...parametros.keys()]) {
    if (DECIDE_EL_TLS.test(clave)) parametros.delete(clave);
  }

  const resto = parametros.toString();
  return {
    url: resto ? `${antes}?${resto}` : antes,
    ssl: sinTls ? false : { rejectUnauthorized: !permisivo },
  };
}
