'use client';
import { useTranslations } from 'next-intl';
import { claveUnidad } from './unidad-clave';

/**
 * Unidad de precio en el idioma del visitante.
 *
 * Se guardaba en castellano y se interpolaba en crudo dentro de la frase del
 * precio, así que una tarjeta en alemán decía «45 a 90 por hora». Es el mismo
 * caso que los nombres de categoría: un conjunto cerrado y pequeño que es
 * vocabulario de interfaz, no algo que haya que traducir con un modelo.
 *
 * Una unidad desconocida se enseña tal cual. Enseñar la clave en crudo sería
 * peor que enseñarla en castellano.
 */
export function useNombreUnidad() {
  const t = useTranslations('unidades');

  return (unidad: string | null | undefined): string => {
    if (!unidad) return '';
    const clave = claveUnidad(unidad);
    return t.has(clave as never) ? t(clave as never) : unidad;
  };
}
