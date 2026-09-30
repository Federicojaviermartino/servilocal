/**
 * Nivel atómico: Molécula
 * Componente: Pagination (navegación entre páginas de resultados)
 */
'use client';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

const SALTO = 'salto';
type Elemento = number | typeof SALTO;

/**
 * Devuelve los números a mostrar, recortando el centro con puntos suspensivos
 * cuando hay demasiadas páginas para caber todas en una línea.
 */
function construirRango(page: number, totalPages: number): Elemento[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const paginas: Elemento[] = [1];
  let inicio = Math.max(2, page - 1);
  let fin = Math.min(totalPages - 1, page + 1);

  if (page <= 3) {
    inicio = 2;
    fin = 4;
  }
  if (page >= totalPages - 2) {
    inicio = totalPages - 3;
    fin = totalPages - 1;
  }

  if (inicio > 2) paginas.push(SALTO);
  for (let p = inicio; p <= fin; p++) paginas.push(p);
  if (fin < totalPages - 1) paginas.push(SALTO);
  paginas.push(totalPages);

  return paginas;
}

export default function Pagination({
  page,
  totalPages,
  onChange,
}: PaginationProps) {
  const t = useTranslations('paginacion');

  if (totalPages <= 1) return null;

  const paginas = construirRango(page, totalPages);
  // Un poco más estrechos en el móvil, y si aun así no caben, a una segunda
  // línea: nueve botones con sus huecos ocupaban 356 px, y a 320 de ancho
  // la página se desplazaba de lado (WCAG 1.4.10).
  const claseBoton =
    'inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-9 sm:px-3';

  return (
    <nav
      className="mt-6 flex flex-wrap items-center justify-center gap-1"
      aria-label={t('navegacion')}
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label={t('anterior')}
        className={clsx(claseBoton, 'text-secundario hover:bg-superficie-alt')}
      >
        {/* En árabe, «anterior» queda a la derecha: la flecha se invierte. */}
        <ChevronLeft
          size={18}
          aria-hidden="true"
          className="rtl:-scale-x-100"
        />
      </button>

      {paginas.map((elemento, indice) =>
        elemento === SALTO ? (
          <span
            key={`salto-${indice}`}
            className="px-2 text-tenue"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <button
            key={elemento}
            type="button"
            onClick={() => onChange(elemento)}
            aria-label={t('pagina', { numero: elemento })}
            aria-current={elemento === page ? 'page' : undefined}
            className={clsx(
              claseBoton,
              elemento === page
                ? 'bg-primary-600 font-medium text-white'
                : 'text-secundario hover:bg-superficie-alt',
            )}
          >
            {elemento}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label={t('siguiente')}
        className={clsx(claseBoton, 'text-secundario hover:bg-superficie-alt')}
      >
        <ChevronRight
          size={18}
          aria-hidden="true"
          className="rtl:-scale-x-100"
        />
      </button>
    </nav>
  );
}
