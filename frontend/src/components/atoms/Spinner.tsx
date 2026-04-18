/**
 * Nivel atomico: Atomo
 * Componente: Spinner (indicador de carga)
 */
import clsx from 'clsx';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4',
};

export default function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={clsx(
        'inline-block animate-spin rounded-full border-primary-200 border-t-primary-600',
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Cargando"
    />
  );
}
