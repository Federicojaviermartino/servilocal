/**
 * Nivel atomico: Molecula
 * Componente: ServiceCard (tarjeta de resultado)
 */
'use client';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MapPin, Euro } from 'lucide-react';
import { Service } from '@/types';
import Badge from '../atoms/Badge';
import RatingStars from './RatingStars';
import ServiceImage from './ServiceImage';

interface ServiceCardProps {
  service: Service;
}

export default function ServiceCard({ service }: ServiceCardProps) {
  const t = useTranslations('tarjeta');

  // La unidad de precio la escribe el profesional, así que va tal cual.
  const priceLabel =
    service.priceMax && service.priceMax !== service.priceMin
      ? t('precioRango', {
          min: service.priceMin,
          max: service.priceMax,
          unidad: service.priceUnit,
        })
      : t('precioUnico', { min: service.priceMin, unidad: service.priceUnit });

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
          <div className="absolute top-2 left-2">
            <Badge variant="info">{service.category.name}</Badge>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-principal line-clamp-1">
          {service.title}
        </h3>
        <p className="mt-1 text-sm text-secundario line-clamp-2">
          {service.description}
        </p>
        <div className="mt-3 flex items-center gap-3 text-sm text-secundario">
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
