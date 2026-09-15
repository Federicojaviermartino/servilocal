/**
 * Nivel atomico: Molecula
 * Componente: RatingStars (visualizacion de valoracion)
 */
'use client';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import clsx from 'clsx';

interface RatingStarsProps {
  rating: number;
  total?: number;
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;
  interactive?: boolean;
  onChange?: (value: number) => void;
}

const sizes = { sm: 14, md: 18, lg: 24 };

export default function RatingStars({
  rating,
  total,
  size = 'md',
  showNumber = false,
  interactive = false,
  onChange,
}: RatingStarsProps) {
  const t = useTranslations('valoracion');
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="inline-flex items-center gap-1">
      <div className="flex items-center">
        {stars.map((value) => (
          <button
            key={value}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onChange?.(value)}
            className={clsx(
              interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default',
              'transition-transform',
            )}
            aria-label={t('valorar', { estrellas: value })}
          >
            <Star
              size={sizes[size]}
              className={
                value <= rating
                  ? 'fill-warning-500 text-warning-500'
                  : 'fill-borde text-tenue'
              }
            />
          </button>
        ))}
      </div>
      {showNumber && (
        <span className="text-sm font-medium text-secundario">
          {rating.toFixed(1)}
          {total !== undefined && (
            <span className="text-tenue font-normal"> ({total})</span>
          )}
        </span>
      )}
    </div>
  );
}
