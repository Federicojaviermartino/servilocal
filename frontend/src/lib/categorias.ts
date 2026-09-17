'use client';
import { useTranslations } from 'next-intl';

/**
 * Nombre de una categoría en el idioma del visitante.
 *
 * Las categorías viven en la base de datos con el nombre en castellano, pero
 * son una lista corta y cerrada: vocabulario de la interfaz, no contenido que
 * escriba nadie. Así que se traducen en los catálogos como cualquier otra
 * cadena, sin pasar por ningún modelo. Es gratis, es instantáneo y no caduca
 * cuando alguien edita algo.
 *
 * La base de datos sigue mandando sobre QUÉ categorías existen; el catálogo
 * solo dice cómo se escriben. Si aparece una que no está traducida —porque la
 * acaba de crear un administrador— se enseña su nombre original: enseñar la
 * clave en crudo sería peor que enseñarla en castellano.
 */
export function useNombreCategoria() {
  const t = useTranslations('categorias');

  return (categoria: { slug?: string; name: string }): string => {
    // t() con una clave que no existe devuelve la clave, no una cadena vacía:
    // hay que preguntar antes con has() en lugar de comprobar el resultado.
    if (!categoria.slug || !t.has(categoria.slug as never)) {
      return categoria.name;
    }
    return t(categoria.slug as never);
  };
}
