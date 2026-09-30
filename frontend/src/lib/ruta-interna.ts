import { useSyncExternalStore } from 'react';

/**
 * Adónde volver después de entrar, solo si es una página de aquí.
 *
 * El parámetro «redirect» llega en la dirección, así que lo puede escribir
 * cualquiera: un enlace a «/auth/login?redirect=https://otro.sitio» llevaba
 * a quien acababa de entrar a una página ajena que podía pedirle la
 * contraseña otra vez. «//otro.sitio» y «/\otro.sitio» también salen del
 * dominio, porque el navegador los lee como direcciones completas.
 */
export function rutaInterna(valor: string | null | undefined): string {
  if (!valor || !valor.startsWith('/')) return '/';
  if (valor.startsWith('//') || valor.startsWith('/\\')) return '/';
  // Los caracteres de control que el navegador ignora al leer la dirección
  // convertirían «/\t/otro.sitio» en «//otro.sitio».
  if (/[\u0000-\u001f\u007f]/.test(valor)) return '/';
  return valor;
}

/**
 * Adónde volver tras entrar: la página en la que se está, con su consulta y
 * sin el prefijo de idioma, que el enrutador vuelve a poner. Se perdía la
 * consulta, o la página entera: el panel mandaba siempre a /dashboard.
 */
export function rutaConConsulta(ruta: string): string {
  return typeof window === 'undefined'
    ? ruta
    : `${ruta}${window.location.search}`;
}

const sinCambios = () => () => {};

/**
 * Un parámetro de la dirección, leído en el navegador sin useSearchParams,
 * que obligaría a envolver la página en Suspense. En el servidor no hay
 * dirección: se pinta sin él y se completa al hidratar.
 */
export function useParametroDeLaDireccion(nombre: string): string | null {
  const consulta = useSyncExternalStore(
    sinCambios,
    () => window.location.search,
    () => '',
  );
  return new URLSearchParams(consulta).get(nombre);
}
