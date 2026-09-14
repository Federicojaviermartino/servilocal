/**
 * Nivel atómico: Molécula
 * Componente: ServiceCardSkeleton
 *
 * Reproduce la silueta de ServiceCard para que la rejilla no cambie de altura
 * cuando llegan los resultados.
 */
import Skeleton from '../atoms/Skeleton';

export default function ServiceCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg bg-superficie shadow-card">
      <Skeleton className="aspect-video rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        <div className="flex gap-3 pt-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}
