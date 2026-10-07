/**
 * Nivel atómico: Molécula
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
import { useIdiomaDelCatalogo } from '../../lib/idioma-catalogo';
import { usePrecioServicio } from '../../lib/importes';

interface ServiceCardProps {
  service: Service;
  /**
   * El nivel del título, según dónde va la tarjeta. En el buscador cuelga
   * directamente del h1, y con un h3 se saltaba un nivel: un lector de
   * pantalla que recorre por encabezados no sabía dónde estaba.
   */
  nivel?: 2 | 3;
}

export default function ServiceCard({ service, nivel = 3 }: ServiceCardProps) {
  const Titulo = nivel === 2 ? 'h2' : 'h3';
  const t = useTranslations('tarjeta');
  const nombreCategoria = useNombreCategoria();
  const precio = usePrecioServicio();
  const idioma = useIdiomaDelCatalogo();

  // La unidad se guarda en castellano y se traduce al pintarla; el valor
  // guardado no se toca, que es el contrato con la API.
  const priceLabel = precio(service);

  return (
    <Link
      href={`/services/${service.id}`}
      className="block bg-superficie rounded-lg shadow-card hover:shadow-card-hover transition-shadow overflow-hidden"
    >
      <div className="aspect-video bg-superficie-alt relative">
        {/* Sin texto alternativo: la tarjeta entera es el enlace, y con el
            título también en la foto su nombre lo decía dos veces. */}
        <ServiceImage
          src={service.images?.[0]}
          alt=""
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
            en castellano se cortaba por el lado equivocado. Y con su idioma:
            ver useIdiomaDelCatalogo. */}
        <Titulo
          dir="auto"
          lang={idioma}
          className="font-semibold text-principal line-clamp-1"
        >
          {service.title}
        </Titulo>
        <p
          dir="auto"
          lang={idioma}
          className="mt-1 text-sm text-secundario line-clamp-2"
        >
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
