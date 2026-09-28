import { useCallback, useEffect, useState } from 'react';

/**
 * Lo que alguien estaba escribiendo cuando la sesión caducó.
 *
 * La sesión dura un día. Quien redactaba una reserva, su perfil o una
 * valoración pulsaba enviar, recibía un error y, para volver a entrar, tenía
 * que salir de la página y perder lo escrito. Ahora se guarda al recibir el
 * 401 y la página lo recupera al volver. En sessionStorage: se queda en esa
 * pestaña y se borra al cerrarla.
 */
const PREFIJO = 'borrador:';

export function guardarBorrador(clave: string, datos: unknown): void {
  try {
    sessionStorage.setItem(PREFIJO + clave, JSON.stringify(datos));
  } catch {
    // Sin almacenamiento, en privado o lleno: se pierde, como antes.
  }
}

/** El borrador de esa clave, si lo hay. Leerlo no lo borra. */
export function leerBorrador<T>(clave: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const guardado = sessionStorage.getItem(PREFIJO + clave);
    return guardado === null ? null : (JSON.parse(guardado) as T);
  } catch {
    return null;
  }
}

export function olvidarBorrador(clave: string): void {
  try {
    sessionStorage.removeItem(PREFIJO + clave);
  } catch {
    // Nada que olvidar.
  }
}

/**
 * El borrador de una pantalla: el que había al abrirla, si lo había, y cómo
 * guardar uno nuevo. Se olvida en cuanto se recupera, para que no vuelva a
 * aparecer la vez siguiente; en un efecto y no al leerlo, porque en
 * desarrollo React calcula dos veces el estado inicial y la segunda ya no
 * lo encontraría.
 */
export function useBorrador<T>(clave: string) {
  const [recuperado] = useState(() => leerBorrador<T>(clave));

  useEffect(() => {
    if (recuperado) olvidarBorrador(clave);
  }, [clave, recuperado]);

  const guardar = useCallback(
    (datos: T) => guardarBorrador(clave, datos),
    [clave],
  );

  return { recuperado, guardar };
}
