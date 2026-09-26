'use client';
import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { MapPin, Euro, Calendar, MessageSquare, Clock } from 'lucide-react';
import { Service, Review } from '@/types';
import { servicesApi, reviewsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';
import Avatar from '@/components/atoms/Avatar';
import Skeleton from '@/components/atoms/Skeleton';
import RatingStars from '@/components/molecules/RatingStars';
import ServiceImage from '@/components/molecules/ServiceImage';
import { useNombreCategoria } from '@/lib/categorias';
import { useNombreUnidad } from '@/lib/unidades';
import { DURACION_POR_DEFECTO, formatearDuracion } from '@/lib/duracion';
import AsistenteBusqueda from '@/components/organisms/AsistenteBusqueda';

export default function ServiceDetailPage() {
  const t = useTranslations('detalle');
  const idioma = useLocale();
  const nombreCategoria = useNombreCategoria();
  const nombreUnidad = useNombreUnidad();
  const tTarjeta = useTranslations('tarjeta');
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;
  const { isAuthenticated } = useAuthStore();

  const [service, setService] = useState<Service | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<
    'not-found' | 'unavailable' | 'network' | null
  >(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [svcRes, revRes] = await Promise.all([
          servicesApi.getById(serviceId),
          reviewsApi.getByService(serviceId),
        ]);
        setService(svcRes.data);
        setReviews(revRes.data || []);
      } catch (err: any) {
        setService(null);
        const status = err?.response?.status;
        if (status === 404) setLoadError('not-found');
        else if (!err?.response) setLoadError('network');
        else setLoadError('unavailable');
      } finally {
        setIsLoading(false);
      }
    }
    if (serviceId) load();
  }, [serviceId]);

  const handleBook = () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/services/${serviceId}/book`);
      return;
    }
    router.push(`/services/${serviceId}/book`);
  };

  const handleContact = () => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    router.push(`/dashboard/messages/${service?.providerId}`);
  };

  if (isLoading) {
    // Reproduce la estructura real de la ficha para que el contenido no
    // desplace la página al llegar.
    return (
      <main className="bg-fondo min-h-screen py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            role="status"
            aria-label={t('cargando')}
          >
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-superficie rounded-lg shadow-card overflow-hidden">
                <Skeleton className="aspect-video rounded-none" />
                <div className="p-6 space-y-4">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="space-y-2 pt-4">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            </div>
            <aside className="space-y-6">
              <div className="bg-superficie rounded-lg shadow-card p-6 space-y-4">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
              <div className="bg-superficie rounded-lg shadow-card p-6 space-y-3">
                <Skeleton className="h-5 w-36" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    );
  }

  if (!service) {
    const title =
      loadError === 'network'
        ? t('errorRedTitulo')
        : loadError === 'unavailable'
          ? t('noDisponibleTitulo')
          : t('noEncontradoTitulo');
    const message =
      loadError === 'network'
        ? t('errorRedTexto')
        : loadError === 'unavailable'
          ? t('noDisponibleTexto')
          : t('noEncontradoTexto');
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-principal">{title}</h1>
        <p className="mt-2 text-secundario">{message}</p>
      </div>
    );
  }

  const priceLabel =
    service.priceMax && service.priceMax !== service.priceMin
      ? tTarjeta('precioRango', {
          min: service.priceMin,
          max: service.priceMax,
          unidad: nombreUnidad(service.priceUnit),
        })
      : tTarjeta('precioUnico', {
          min: service.priceMin,
          unidad: nombreUnidad(service.priceUnit),
        });

  return (
    <main className="bg-fondo min-h-screen py-8">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-superficie rounded-lg shadow-card overflow-hidden">
              <div className="aspect-video bg-superficie-alt relative">
                <ServiceImage
                  src={service.images?.[0]}
                  alt={service.title}
                  categoryIcon={service.category?.icon}
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  priority
                  iconSize={72}
                />
              </div>
              <div className="p-6">
                {service.category && (
                  <Badge variant="info" className="mb-3">
                    {nombreCategoria(service.category)}
                  </Badge>
                )}
                <h1 className="text-2xl font-bold text-principal">
                  {service.title}
                </h1>
                <div className="mt-3 flex items-center gap-4 text-sm text-secundario">
                  <div className="flex items-center gap-1">
                    <MapPin size={16} />
                    <span>{service.city}</span>
                  </div>
                  <RatingStars
                    rating={service.averageRating || 0}
                    total={service.totalReviews}
                    showNumber
                  />
                </div>
                <div className="mt-6 prose prose-neutral max-w-none">
                  <h2 className="text-lg font-semibold text-principal">
                    {t('descripcion')}
                  </h2>
                  <p className="text-secundario whitespace-pre-line">
                    {service.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Reseñas */}
            <div className="bg-superficie rounded-lg shadow-card p-6">
              <h2 className="text-lg font-semibold text-principal mb-4">
                {t('valoraciones', { total: reviews.length })}
              </h2>
              {reviews.length === 0 ? (
                <p className="text-secundario text-sm">
                  {t('sinValoraciones')}
                </p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="border-b border-borde pb-4 last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar
                          name={`${review.client.firstName} ${review.client.lastName}`}
                          size="sm"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-principal text-sm">
                              {review.client.firstName} {review.client.lastName}
                            </p>
                            <RatingStars rating={review.rating} size="sm" />
                          </div>
                          {review.comment && (
                            <p className="mt-2 text-secundario text-sm">
                              {review.comment}
                            </p>
                          )}
                          {review.providerResponse && (
                            <div className="mt-3 ms-4 ps-3 border-s-2 border-primary-200">
                              <p className="text-xs font-medium text-tenue mb-1">
                                {t('respuestaProfesional')}
                              </p>
                              <p className="text-sm text-secundario">
                                {review.providerResponse}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Columna lateral: reserva y proveedor */}
          <aside className="space-y-6">
            <div className="bg-superficie rounded-lg shadow-card p-6 sticky top-4">
              <div className="flex items-center gap-1 mb-4">
                <Euro size={20} className="text-acento" />
                <span className="text-2xl font-bold text-principal">
                  {priceLabel}
                </span>
              </div>
              <p className="-mt-2 mb-4 flex items-center gap-1 text-sm text-secundario">
                <Clock size={14} aria-hidden="true" />
                {t('duracion', {
                  duracion: formatearDuracion(
                    service.durationMinutes ?? DURACION_POR_DEFECTO,
                    idioma,
                  ),
                })}
              </p>
              <Button onClick={handleBook} fullWidth size="lg">
                <Calendar size={18} className="inline me-2" />
                {t('reservar')}
              </Button>
              <Button
                onClick={handleContact}
                variant="secondary"
                fullWidth
                className="mt-2"
              >
                <MessageSquare size={18} className="inline me-2" />
                {t('contactar')}
              </Button>
            </div>

            <div className="bg-superficie rounded-lg shadow-card p-6">
              <h3 className="font-semibold text-principal mb-3">
                {t('sobreProfesional')}
              </h3>
              <div className="flex items-center gap-3">
                <Avatar
                  name={`${service.provider.firstName} ${service.provider.lastName}`}
                  size="lg"
                />
                <div>
                  <p className="font-medium text-principal">
                    {service.provider.firstName} {service.provider.lastName}
                  </p>
                  <p className="text-sm text-secundario">
                    {service.provider.city || service.city}
                  </p>
                </div>
              </div>
              {service.provider.bio && (
                <p className="mt-4 text-sm text-secundario">
                  {service.provider.bio}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
      <AsistenteBusqueda />
    </main>
  );
}
