'use client';
import { useSyncExternalStore } from 'react';

/**
 * Si la página está en tema oscuro, leído de donde vive: la clase `dark` de
 * <html>, que pone el script en línea del layout antes del primer pintado.
 *
 * Antes cada componente la leía en un efecto al montar y la copiaba en su
 * propio estado. Eso pintaba dos veces, y además cada copia iba por su lado:
 * al cambiar el tema desde un selector, el otro —la cabecera tiene uno en
 * escritorio y otro en el menú del móvil— se quedaba con el icono de antes.
 * Con useSyncExternalStore todos leen la misma fuente y se enteran de cada
 * cambio.
 */
function suscribir(avisar: () => void): () => void {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observador.disconnect();
}

const enElNavegador = () => document.documentElement.classList.contains('dark');

/**
 * El servidor no sabe qué tema tiene cada visitante: null, y el primer
 * render del cliente coincide con el suyo. Justo después React vuelve a
 * pintar con el valor de verdad.
 */
const enElServidor = () => null;

export function useTemaOscuro(): boolean | null {
  return useSyncExternalStore(suscribir, enElNavegador, enElServidor);
}
