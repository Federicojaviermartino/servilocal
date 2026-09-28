/**
 * Cómo desplazarse: con animación, salvo que se haya pedido menos
 * movimiento.
 *
 * El CSS global ya apaga las animaciones con prefers-reduced-motion, pero
 * no alcanza a un desplazamiento pedido desde JavaScript con «smooth»: ese
 * se animaba igual.
 */
export function desplazamiento(): ScrollBehavior {
  if (typeof window === 'undefined' || !window.matchMedia) return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}
