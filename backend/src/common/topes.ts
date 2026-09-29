/**
 * Cuántas filas devuelve como mucho cada lista, siempre las más recientes.
 *
 * Ninguna tenía tope: un hilo con miles de mensajes o un servicio con miles
 * de valoraciones se devolvían enteros, y dos de esas listas son públicas.
 * Lo de cada cual que quede fuera sigue en su exportación de datos.
 */

/** Las que puede pedir cualquiera, sin sesión. */
export const TOPE_LISTA_PUBLICA = 100;

/** Las de cada cual: sus reservas, sus pagos, sus mensajes. */
export const TOPE_LISTA = 200;

/** Las cuentas, en el panel de la administración. */
export const TOPE_ADMINISTRACION = 500;
