import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useNombreUnidad } from './unidades';

/**
 * Un importe en euros como se escribe en cada idioma: «45 €» y «45,50 €» en
 * castellano, «€45.50» en inglés, «45,50 €» en alemán.
 *
 * Antes cada catálogo decía «{importe} euros» y el número llegaba tal cual:
 * «45.5 euros», con punto decimal y sin el cero, en todos los idiomas. Y la
 * tarjeta de un servicio decía «30 por hora», sin moneda.
 *
 * Sin céntimos si el importe es entero, porque en un precio «30,00 €» solo
 * añade ruido; con ellos siempre que se pida, como en lo que se cobra.
 */
export function formatearImporte(
  euros: number | string,
  idioma: string,
  conCentimos = false,
): string {
  const valor = Number(euros);
  const decimales = conCentimos || !Number.isInteger(valor) ? 2 : 0;
  return new Intl.NumberFormat(idioma, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

/** formatearImporte en el idioma de la página. */
export function useImporte() {
  const idioma = useLocale();
  return useCallback(
    (euros: number | string, conCentimos?: boolean) =>
      formatearImporte(euros, idioma, conCentimos),
    [idioma],
  );
}

/** Lo que hace falta de un servicio para escribir su precio. */
export interface ConPrecio {
  priceMin: number | string;
  priceMax?: number | string | null;
}

/**
 * «30 € por hora» o «30 € a 50 € por hora». La frase es del catálogo
 * «tarjeta»; quien llama da el traductor, el idioma y la unidad ya
 * traducida, así que sirve en el navegador y en el servidor.
 */
export function textoDelPrecio(
  servicio: ConPrecio,
  t: (
    clave: 'precioRango' | 'precioUnico',
    valores: Record<string, string>,
  ) => string,
  idioma: string,
  unidad: string,
): string {
  const min = formatearImporte(servicio.priceMin, idioma);
  return servicio.priceMax &&
    Number(servicio.priceMax) !== Number(servicio.priceMin)
    ? t('precioRango', {
        min,
        max: formatearImporte(servicio.priceMax, idioma),
        unidad,
      })
    : t('precioUnico', { min, unidad });
}

/** El precio de un servicio en el idioma de la página. */
export function usePrecioServicio() {
  const t = useTranslations('tarjeta');
  const idioma = useLocale();
  const nombreUnidad = useNombreUnidad();
  return (servicio: ConPrecio & { priceUnit?: string | null }): string =>
    textoDelPrecio(servicio, t, idioma, nombreUnidad(servicio.priceUnit));
}

/**
 * Un importe con céntimos, que es lo que se cobra.
 *
 * Un campo numérico deja escribir 45,555. La API lo rechaza —antes guardaba
 * 45,56 y respondía 45,555—, y lo que el formulario enseña en su resumen ya
 * va redondeado: se envía lo mismo que se ve.
 */
export const aCentimos = (importe: number): number =>
  Math.round(importe * 100) / 100;
