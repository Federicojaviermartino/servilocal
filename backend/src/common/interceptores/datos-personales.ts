/**
 * Tapa los datos personales de lo que se devuelve a la administración de
 * demostración.
 *
 * Esa cuenta se publica en la pantalla de acceso para que cualquiera recorra
 * el panel, y no puede escribir nada. Pero leía todo: el correo y el teléfono
 * de cada usuario, la dirección y las coordenadas de su casa, y los correos
 * del historial de moderación. Con el registro abierto, cualquiera que se
 * diera de alta de verdad quedaba a la vista de cualquier visitante. El panel
 * sigue funcionando igual, con los mismos listados; solo que lo que
 * identifica o localiza a una persona sale tapado.
 */

const TAPADO = '•••';

/** Claves de correo, estén donde estén: fichas, historial y su contexto. */
const CORREOS = new Set(['email', 'actorEmail']);

/** Lo que localiza o permite contactar a una persona. */
const CONTACTO = new Set(['phone', 'address', 'postalCode']);
const UBICACION = new Set(['location', 'latitude', 'longitude']);

/** «laura@ejemplo.com» → «l•••@e•••». */
export function taparCorreo(correo: unknown): unknown {
  if (typeof correo !== 'string' || !correo.includes('@')) return correo;
  const [usuario, dominio] = correo.split('@');
  return `${usuario.charAt(0)}${TAPADO}@${dominio.charAt(0)}${TAPADO}`;
}

const esPersona = (objeto: Record<string, unknown>) =>
  'firstName' in objeto || 'lastName' in objeto;

/**
 * Una copia de la respuesta con los datos personales tapados. No toca el
 * original, que puede estar en una caché compartida con otras peticiones.
 * Lo del propio usuario de demostración se deja como está: es suyo.
 */
export function taparDatosPersonales(
  valor: unknown,
  propioId?: string,
): unknown {
  if (Array.isArray(valor)) {
    return valor.map((elemento) => taparDatosPersonales(elemento, propioId));
  }
  if (valor === null || typeof valor !== 'object' || valor instanceof Date) {
    return valor;
  }

  const objeto = valor as Record<string, unknown>;
  if (propioId && objeto.id === propioId) return valor;

  const persona = esPersona(objeto);
  const copia: Record<string, unknown> = {};
  for (const [clave, contenido] of Object.entries(objeto)) {
    if (CORREOS.has(clave)) {
      copia[clave] = taparCorreo(contenido);
    } else if (persona && CONTACTO.has(clave)) {
      copia[clave] = contenido ? TAPADO : contenido;
    } else if (persona && UBICACION.has(clave)) {
      copia[clave] = null;
    } else if (
      persona &&
      clave === 'lastName' &&
      typeof contenido === 'string'
    ) {
      copia[clave] = contenido ? `${contenido.charAt(0)}.` : contenido;
    } else {
      copia[clave] = taparDatosPersonales(contenido, propioId);
    }
  }
  return copia;
}
