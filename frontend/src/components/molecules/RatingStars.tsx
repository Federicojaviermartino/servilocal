/**
 * Nivel atómico: Molécula
 * Componente: RatingStars (visualización y elección de una valoración)
 */
'use client';
import { useId, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import clsx from 'clsx';

interface RatingStarsProps {
  rating: number;
  total?: number;
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;
  interactive?: boolean;
  onChange?: (value: number) => void;
  /** Para elegir: el id del texto que da nombre al grupo. */
  idEtiqueta?: string;
  /** Para elegir: permite no marcar ninguna, con este texto. */
  ninguna?: string;
}

const sizes = { sm: 14, md: 18, lg: 24 };
const VALORES = [1, 2, 3, 4, 5];

function Estrella({ llena, tamano }: { llena: boolean; tamano: number }) {
  return (
    <Star
      size={tamano}
      aria-hidden="true"
      className={
        llena ? 'fill-warning-500 text-warning-500' : 'fill-borde text-tenue'
      }
    />
  );
}

/**
 * Las estrellas eran cinco botones, también cuando solo se enseñaba una
 * nota: deshabilitados, con «Valorar con N estrellas», y la nota solo se
 * veía por el color. Un lector de pantalla oía cinco «Valorar» por reseña y
 * ninguna nota, y en una tarjeta eran botones dentro de un enlace.
 *
 * Ahora, para enseñar, es una imagen que dice la nota; para elegir, un
 * grupo de radios, que anuncia la marcada y se recorre con las flechas.
 */
export default function RatingStars({
  rating,
  total,
  size = 'md',
  showNumber = false,
  interactive = false,
  onChange,
  idEtiqueta,
  ninguna,
}: RatingStarsProps) {
  const t = useTranslations('valoracion');
  const formato = useFormatter();
  const nombre = useId();
  const tamano = sizes[size];

  if (interactive) {
    const opcion = (valor: number, contenido: ReactNode, texto: string) => (
      <label
        key={valor}
        className="cursor-pointer rounded transition-transform hover:scale-110 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-acento"
      >
        <input
          type="radio"
          name={nombre}
          value={valor}
          checked={rating === valor}
          onChange={() => onChange?.(valor)}
          className="sr-only"
        />
        {contenido}
        <span className="sr-only">{texto}</span>
      </label>
    );

    return (
      <div
        role="radiogroup"
        aria-labelledby={idEtiqueta}
        className="inline-flex flex-wrap items-center gap-1"
      >
        {ninguna &&
          opcion(
            0,
            <span
              aria-hidden="true"
              className={clsx(
                'me-1 rounded px-2 py-0.5 text-sm',
                rating === 0
                  ? 'bg-primary-600 text-white'
                  : 'text-secundario underline',
              )}
            >
              {ninguna}
            </span>,
            ninguna,
          )}
        {VALORES.map((valor) =>
          opcion(
            valor,
            <Estrella llena={valor <= rating} tamano={tamano} />,
            t('estrellas', { estrellas: valor }),
          ),
        )}
      </div>
    );
  }

  const nota = formato.number(rating, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <span
      role="img"
      aria-label={
        showNumber && total !== undefined
          ? t('notaConTotal', { nota, total })
          : t('nota', { nota })
      }
      className="inline-flex items-center gap-1"
    >
      <span className="flex items-center">
        {VALORES.map((valor) => (
          <Estrella key={valor} llena={valor <= rating} tamano={tamano} />
        ))}
      </span>
      {showNumber && (
        <span
          aria-hidden="true"
          className="text-sm font-medium text-secundario"
        >
          {nota}
          {total !== undefined && (
            <span className="text-tenue font-normal"> ({total})</span>
          )}
        </span>
      )}
    </span>
  );
}
