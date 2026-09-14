/**
 * Nivel atómico: Molécula
 * Componente: Pagination (navegación entre páginas de resultados)
 */
'use client';
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
  if (totalPages <= 1) return null;

  const paginas = construirRango(page, totalPages);
  const claseBoton =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav
      className="mt-6 flex items-center justify-center gap-1"
      aria-label="Paginación de resultados"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className={clsx(claseBoton, 'text-secundario hover:bg-superficie-alt')}
      >
        <ChevronLeft size={18} aria-hidden="true" />
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
            aria-label={`Página ${elemento}`}
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
        aria-label="Página siguiente"
        className={clsx(claseBoton, 'text-secundario hover:bg-superficie-alt')}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}
