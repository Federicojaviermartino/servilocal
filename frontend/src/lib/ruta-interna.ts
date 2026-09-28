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
