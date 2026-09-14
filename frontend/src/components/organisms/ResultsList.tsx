/**
 * Nivel atomico: Organismo
 * Componente: ResultsList (listado paginado de servicios)
 */
import { Service } from '@/types';
import ServiceCard from '../molecules/ServiceCard';

interface ResultsListProps {
  services: Service[];
  total?: number;
}

// Solo se renderiza cuando la búsqueda ha respondido correctamente, así que
// una lista vacía significa cero resultados y nunca un fallo de red.
export default function ResultsList({ services, total }: ResultsListProps) {
  if (services.length === 0) {
    return (
      <div className="bg-superficie rounded-lg shadow-card p-10 text-center">
        <p className="text-secundario">
          No se han encontrado servicios con los filtros aplicados.
        </p>
        <p className="mt-2 text-sm text-tenue">
          Prueba a ampliar el radio de búsqueda o eliminar algún filtro.
        </p>
      </div>
    );
  }

  return (
    <div>
      {total !== undefined && (
        <p className="mb-4 text-sm text-secundario">
          {total}{' '}
          {total === 1 ? 'resultado encontrado' : 'resultados encontrados'}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>
    </div>
  );
}
