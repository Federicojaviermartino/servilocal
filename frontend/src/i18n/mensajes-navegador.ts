import type { AbstractIntlMessages } from 'next-intl';

/**
 * Los espacios del catálogo que solo usan componentes de servidor: los
 * metadatos, los textos de «Acerca de», el aviso de los textos legales, la
 * página de «no encontrado» y el pie. Se pintan en el servidor y el
 * navegador no los necesita.
 *
 * El catálogo entero viajaba en cada página. Repartirlo por rutas ahorraría
 * más, pero exigiría un proveedor por página; esto es lo que sale gratis.
 * Si un componente de cliente llega a usar uno de estos espacios, next-intl
 * avisa de que falta el mensaje, y basta con quitarlo de aquí.
 */
export const SOLO_SERVIDOR = [
  'meta',
  'acercaDe',
  'legal',
  'noEncontrado',
  'pie',
] as const;

export function mensajesDelNavegador(
  mensajes: AbstractIntlMessages,
): AbstractIntlMessages {
  return Object.fromEntries(
    Object.entries(mensajes).filter(
      ([espacio]) => !(SOLO_SERVIDOR as readonly string[]).includes(espacio),
    ),
  );
}
