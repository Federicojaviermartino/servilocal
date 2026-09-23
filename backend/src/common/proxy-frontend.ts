import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Cómo reconoce la API las peticiones que le reenvía el frontend.
 *
 * El navegador ya no habla con la API directamente: pasa por el frontend,
 * para que la cookie de sesión sea del mismo sitio que la página. Visto
 * desde aquí, entonces, todas esas peticiones llegan desde la misma
 * dirección, la del servidor del frontend, y el limitador las contaría
 * juntas: cinco intentos de acceso por minuto para todo el mundo a la vez.
 *
 * Así que el frontend manda aparte la dirección real del visitante. Y como
 * cualquiera puede llamar a la API directamente y mandar esa misma cabecera,
 * solo se cree si viene con un secreto que conocen los dos servicios y nadie
 * más. Sin él, sería una forma de saltarse el limitador mandando una
 * cabecera.
 */
export const CABECERA_SECRETO_PROXY = 'x-proxy-secreto';
export const CABECERA_VISITANTE_PROXY = 'x-visitante-ip';

/**
 * Un secreto corto se puede adivinar probando. Por debajo de esto se ignora,
 * como si no estuviera, y el arranque lo dice.
 */
const LONGITUD_MINIMA = 32;

export function secretoDelProxy(): string | null {
  const secreto = process.env.PROXY_SECRETO?.trim();
  return secreto && secreto.length >= LONGITUD_MINIMA ? secreto : null;
}

function primera(valor: unknown): string | null {
  // Node entrega las cabeceras repetidas como array.
  const unica = Array.isArray(valor) ? valor[0] : valor;
  return typeof unica === 'string' && unica.trim() ? unica.trim() : null;
}

/**
 * Compara en tiempo constante. Con ===, lo que tarda en fallar dice cuántos
 * caracteres del principio acertaste, y eso permite adivinarlo por partes.
 * Se comparan los resúmenes porque timingSafeEqual exige la misma longitud.
 */
function coincide(recibido: string, esperado: string): boolean {
  const resumen = (texto: string) =>
    createHash('sha256').update(texto).digest();
  return timingSafeEqual(resumen(recibido), resumen(esperado));
}

/**
 * La dirección del visitante que reenvía el frontend, o null si la petición
 * no viene de él o no trae el secreto bueno.
 */
export function visitanteReenviado(
  cabeceras: Record<string, unknown>,
): string | null {
  const secreto = secretoDelProxy();
  if (!secreto) return null;

  const recibido = primera(cabeceras[CABECERA_SECRETO_PROXY]);
  const visitante = primera(cabeceras[CABECERA_VISITANTE_PROXY]);
  if (!recibido || !visitante) return null;

  return coincide(recibido, secreto) ? visitante : null;
}
