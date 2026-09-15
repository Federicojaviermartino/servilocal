/**
 * Nivel atomico: Organismo
 * Componente: ResultsList (listado paginado de servicios)
 */
import { useTranslations } from 'next-intl';
import { Service } from '@/types';
import ServiceCard from '../molecules/ServiceCard';

interface ResultsListProps {
  services: Service[];
  total?: number;
}

// Solo se renderiza cuando la búsqueda ha respondido correctamente, así que
// una lista vacía significa cero resultados y nunca un fallo de red.
export default function ResultsList({ services, total }: ResultsListProps) {
  const t = useTranslations('resultados');

  if (services.length === 0) {
    return (
      <div className="bg-superficie rounded-lg shadow-card p-10 text-center">
        <p className="text-secundario">{t('sinResultados')}</p>
        <p className="mt-2 text-sm text-tenue">{t('sinResultadosPista')}</p>
      </div>
    );
  }

  return (
    <div>
      {total !== undefined && (
        <p className="mb-4 text-sm text-secundario">{t('cuenta', { total })}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>
    </div>
  );
}
