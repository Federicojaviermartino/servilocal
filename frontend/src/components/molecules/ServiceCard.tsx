/**
 * Nivel atomico: Molecula
 * Componente: ServiceCard (tarjeta de resultado)
 */
'use client';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MapPin } from 'lucide-react';
import { Service } from '@/types';
import Badge from '../atoms/Badge';
import RatingStars from './RatingStars';
import ServiceImage from './ServiceImage';
import { useNombreCategoria } from '../../lib/categorias';
import { usePrecioServicio } from '../../lib/importes';

interface ServiceCardProps {
  service: Service;
}

export default function ServiceCard({ service }: ServiceCardProps) {
  const t = useTranslations('tarjeta');
  const nombreCategoria = useNombreCategoria();
  const precio = usePrecioServicio();

  // La unidad se guarda en castellano y se traduce al pintarla; el valor
  // guardado no se toca, que es el contrato con la API.
  const priceLabel = precio(service);

  return (
    <Link
      href={`/services/${service.id}`}
      className="block bg-superficie rounded-lg shadow-card hover:shadow-card-hover transition-shadow overflow-hidden"
    >
      <div className="aspect-video bg-superficie-alt relative">
        <ServiceImage
          src={service.images?.[0]}
          alt={service.title}
          categoryIcon={service.category?.icon}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        {service.category && (
          <div className="absolute top-2 start-2">
            <Badge variant="info">{nombreCategoria(service.category)}</Badge>
          </div>
        )}
      </div>
      <div className="p-4">
        {/* dir="auto" en lo que escribe el profesional: en árabe, un título
            en castellano se cortaba por el lado equivocado. */}
        <h3 dir="auto" className="font-semibold text-principal line-clamp-1">
          {service.title}
        </h3>
        <p dir="auto" className="mt-1 text-sm text-secundario line-clamp-2">
          {service.description}
        </p>
        <div className="mt-3 flex items-center gap-3 text-sm text-secundario">
          <div className="flex items-center gap-1">
            <MapPin size={14} />
            <span>{service.city}</span>
          </div>
          <span>{priceLabel}</span>
        </div>
        <div className="mt-3">
          <RatingStars
            rating={service.averageRating || 0}
            total={service.totalReviews}
            size="sm"
            showNumber
          />
        </div>
      </div>
    </Link>
  );
}
