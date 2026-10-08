/**
 * Nivel atómico: Molécula
 * Componente: OrdenResultados (en qué orden salen los resultados)
 */
'use client';
import type { Ref } from 'react';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { Orden } from '@/lib/busqueda';

interface OrdenResultadosProps {
  valor: Orden;
  /** Si la búsqueda tiene un punto desde el que medir la distancia. */
  conCercania: boolean;
  onCambiar: (orden: Orden) => void;
  /** El botón del orden vigente, para devolverle el foco tras cambiarlo. */
  refVigente?: Ref<HTMLButtonElement>;
}

const OPCIONES = [
  ['distance', 'ordenCercania'],
  ['newest', 'ordenRecientes'],
  ['rating', 'ordenValoracion'],
  ['price', 'ordenPrecio'],
] as const;

/**
 * El orden de los resultados.
 *
 * La API sabía ordenar por valoración, por precio y por distancia, y la
 * interfaz no lo ofrecía: todo salía por fecha de publicación.
 *
 * Botones de dos estados y no un desplegable. Cambiar de orden es cambiar la
 * dirección, y un desplegable que navega al cambiar se lleva la página con
 * cada flecha del teclado: es lo que pasaba con el selector de idioma. El
 * que está puesto lo dice con aria-pressed, no solo con el color.
 *
 * «Más cercanos» solo aparece si hay desde dónde medir.
 */
export default function OrdenResultados({
  valor,
  conCercania,
  onCambiar,
  refVigente,
}: OrdenResultadosProps) {
  const t = useTranslations('resultados');
  const etiqueta = useId();

  return (
    <div
      role="group"
      aria-labelledby={etiqueta}
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <span id={etiqueta} className="text-sm text-secundario">
        {t('ordenar')}
      </span>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-superficie p-1 shadow-card">
        {OPCIONES.filter(([orden]) => orden !== 'distance' || conCercania).map(
          ([orden, clave]) => {
            const puesto = valor === orden;
            return (
              <button
                key={orden}
                ref={puesto ? refVigente : undefined}
                type="button"
                aria-pressed={puesto}
                onClick={() => onCambiar(orden)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  puesto
                    ? 'bg-primary-600 font-semibold text-white'
                    : 'text-secundario hover:bg-fondo'
                }`}
              >
                {t(clave)}
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}
