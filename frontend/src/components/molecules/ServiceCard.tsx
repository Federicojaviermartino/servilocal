/**
 * Nivel atomico: Molecula
 * Componente: ServiceCard (tarjeta de resultado)
 */
import Link from 'next/link';
import { MapPin, Euro } from 'lucide-react';
import { Service } from '@/types';
import Badge from '../atoms/Badge';
import RatingStars from './RatingStars';

interface ServiceCardProps {
  service: Service;
}

export default function ServiceCard({ service }: ServiceCardProps) {
  const priceLabel =
    service.priceMax && service.priceMax !== service.priceMin
      ? `${service.priceMin} a ${service.priceMax} ${service.priceUnit}`
      : `${service.priceMin} ${service.priceUnit}`;

  return (
    <Link
      href={`/services/${service.id}`}
      className="block bg-white rounded-lg shadow-card hover:shadow-card-hover transition-shadow overflow-hidden"
    >
      <div className="aspect-video bg-neutral-100 relative">
        {service.images?.[0] ? (
          <img
            src={service.images[0]}
            alt={service.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400">
            Sin imagen
          </div>
        )}
        {service.category && (
          <div className="absolute top-2 left-2">
            <Badge variant="info">{service.category.name}</Badge>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-neutral-900 line-clamp-1">
          {service.title}
        </h3>
        <p className="mt-1 text-sm text-neutral-600 line-clamp-2">
          {service.description}
        </p>
        <div className="mt-3 flex items-center gap-3 text-sm text-neutral-600">
          <div className="flex items-center gap-1">
            <MapPin size={14} />
            <span>{service.city}</span>
          </div>
          <div className="flex items-center gap-1">
            <Euro size={14} />
            <span>{priceLabel}</span>
          </div>
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
