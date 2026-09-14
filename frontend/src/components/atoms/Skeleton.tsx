/**
 * Nivel atómico: Átomo
 * Componente: Skeleton (bloque de carga)
 *
 * Un esqueleto con la forma del contenido que va a llegar transmite progreso
 * mejor que un indicador giratorio, y evita que la página salte cuando los
 * datos entran.
 */
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx('animate-pulse rounded bg-superficie-alt', className)}
      aria-hidden="true"
    />
  );
}
