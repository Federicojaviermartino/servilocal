'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MapPin, Euro, Calendar, MessageSquare } from 'lucide-react';
import { Service, Review } from '@/types';
import { servicesApi, reviewsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';
import Avatar from '@/components/atoms/Avatar';
import Spinner from '@/components/atoms/Spinner';
import RatingStars from '@/components/molecules/RatingStars';

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;
  const { isAuthenticated } = useAuthStore();

  const [service, setService] = useState<Service | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<'not-found' | 'unavailable' | 'network' | null>(null);

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
    router.push(`/messages/${service?.providerId}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!service) {
    const title =
      loadError === 'network'
        ? 'No se pudo contactar con el servidor'
        : loadError === 'unavailable'
          ? 'Servicio no disponible'
          : 'Servicio no encontrado';
    const message =
      loadError === 'network'
        ? 'Comprueba tu conexión e inténtalo de nuevo en unos segundos.'
        : loadError === 'unavailable'
          ? 'Inténtalo de nuevo más tarde.'
          : 'El servicio que buscas no existe o ha sido eliminado.';
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
        <p className="mt-2 text-neutral-600">{message}</p>
      </div>
    );
  }

  const priceLabel =
    service.priceMax && service.priceMax !== service.priceMin
      ? `${service.priceMin} a ${service.priceMax} ${service.priceUnit}`
      : `${service.priceMin} ${service.priceUnit}`;

  return (
    <main className="bg-neutral-50 min-h-screen py-8">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-card overflow-hidden">
              <div className="aspect-video bg-neutral-100">
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
              </div>
              <div className="p-6">
                {service.category && (
                  <Badge variant="info" className="mb-3">
                    {service.category.name}
                  </Badge>
                )}
                <h1 className="text-2xl font-bold text-neutral-900">
                  {service.title}
                </h1>
                <div className="mt-3 flex items-center gap-4 text-sm text-neutral-600">
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
                  <h2 className="text-lg font-semibold text-neutral-900">
                    Descripcion del servicio
                  </h2>
                  <p className="text-neutral-700 whitespace-pre-line">
                    {service.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Reseñas */}
            <div className="bg-white rounded-lg shadow-card p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-4">
                Valoraciones ({reviews.length})
              </h2>
              {reviews.length === 0 ? (
                <p className="text-neutral-600 text-sm">
                  Este servicio aun no tiene valoraciones.
                </p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="border-b border-neutral-100 pb-4 last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar
                          name={`${review.client.firstName} ${review.client.lastName}`}
                          size="sm"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-neutral-900 text-sm">
                              {review.client.firstName}{' '}
                              {review.client.lastName}
                            </p>
                            <RatingStars rating={review.rating} size="sm" />
                          </div>
                          {review.comment && (
                            <p className="mt-2 text-neutral-700 text-sm">
                              {review.comment}
                            </p>
                          )}
                          {review.providerResponse && (
                            <div className="mt-3 ml-4 pl-3 border-l-2 border-primary-200">
                              <p className="text-xs font-medium text-neutral-500 mb-1">
                                Respuesta del profesional
                              </p>
                              <p className="text-sm text-neutral-700">
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
            <div className="bg-white rounded-lg shadow-card p-6 sticky top-4">
              <div className="flex items-center gap-1 mb-4">
                <Euro size={20} className="text-primary-600" />
                <span className="text-2xl font-bold text-neutral-900">
                  {priceLabel}
                </span>
              </div>
              <Button onClick={handleBook} fullWidth size="lg">
                <Calendar size={18} className="inline mr-2" />
                Reservar ahora
              </Button>
              <Button
                onClick={handleContact}
                variant="secondary"
                fullWidth
                className="mt-2"
              >
                <MessageSquare size={18} className="inline mr-2" />
                Contactar
              </Button>
            </div>

            <div className="bg-white rounded-lg shadow-card p-6">
              <h3 className="font-semibold text-neutral-900 mb-3">
                Sobre el profesional
              </h3>
              <div className="flex items-center gap-3">
                <Avatar
                  name={`${service.provider.firstName} ${service.provider.lastName}`}
                  size="lg"
                />
                <div>
                  <p className="font-medium text-neutral-900">
                    {service.provider.firstName} {service.provider.lastName}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {service.provider.city || service.city}
                  </p>
                </div>
              </div>
              {service.provider.bio && (
                <p className="mt-4 text-sm text-neutral-700">
                  {service.provider.bio}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
