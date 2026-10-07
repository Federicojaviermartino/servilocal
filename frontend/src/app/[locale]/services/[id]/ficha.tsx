'use client';
import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { MapPin, Calendar, MessageSquare, Clock } from 'lucide-react';
import { Service, Review, UserRole } from '@/types';
import { servicesApi, reviewsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';
import Avatar from '@/components/atoms/Avatar';
import Skeleton from '@/components/atoms/Skeleton';
import RatingStars from '@/components/molecules/RatingStars';
import ServiceImage from '@/components/molecules/ServiceImage';
import { useNombreCategoria } from '@/lib/categorias';
import { useIdiomaDelCatalogo } from '@/lib/idioma-catalogo';
import { usePrecioServicio } from '@/lib/importes';
import { DURACION_POR_DEFECTO, formatearDuracion } from '@/lib/duracion';
import AsistenteBusqueda from '@/components/organisms/AsistenteBusqueda';
import RespuestaValoracion from '@/components/molecules/RespuestaValoracion';

/**
 * La ficha pública de un servicio.
 *
 * Llega ya con el servicio y sus valoraciones, pedidos en el servidor (ver
 * page.tsx): antes se pedían desde aquí, en un efecto, y el HTML solo
 * traía esqueletos. Un buscador o una vista previa en una red social no
 * veían ni el título, y en un móvil había que esperar al segundo viaje a
 * la API. Si el servidor no pudo preguntar, se pide desde aquí, como antes.
 */
export default function FichaServicio({
  serviceId,
  inicial,
}: {
  serviceId: string;
  inicial?: { servicio: Service; valoraciones: Review[] };
}) {
  const t = useTranslations('detalle');
  const tComun = useTranslations('comun');
  const idioma = useLocale();
  const nombreCategoria = useNombreCategoria();
  const precio = usePrecioServicio();
  const idiomaDelCatalogo = useIdiomaDelCatalogo();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();

  const [service, setService] = useState<Service | null>(
    inicial?.servicio ?? null,
  );
  const [reviews, setReviews] = useState<Review[]>(inicial?.valoraciones ?? []);
  const [isLoading, setIsLoading] = useState(!inicial);
  const [loadError, setLoadError] = useState<
    'not-found' | 'unavailable' | 'network' | null
  >(null);
  // Volver a pedirla sin recargar: sin red, la ficha se quedaba en el aviso.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (inicial && intento === 0) return;
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
  }, [serviceId, inicial, intento]);

  const handleBook = () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/services/${serviceId}/book`);
      return;
    }
    router.push(`/services/${serviceId}/book`);
  };

  const handleContact = () => {
    if (!isAuthenticated) {
      // De vuelta a la ficha al entrar, no a la portada.
      router.push(`/auth/login?redirect=/services/${serviceId}`);
      return;
    }
    // Con el servicio: si aún no hay mensajes, la conversación saca de él
    // con quién es.
    router.push(
      `/dashboard/messages/${service?.providerId}?servicio=${serviceId}`,
    );
  };

  if (isLoading) {
    // Reproduce la estructura real de la ficha para que el contenido no
    // desplace la página al llegar.
    return (
      <div className="bg-fondo min-h-screen py-8">
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
      </div>
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
        {loadError !== 'not-found' && (
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setIntento((i) => i + 1)}
          >
            {tComun('reintentar')}
          </Button>
        )}
      </div>
    );
  }

  const priceLabel = precio(service);

  return (
    <div className="bg-fondo min-h-screen py-8">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* En el móvil la rejilla es una columna, y el orden es el del
              código: la reserva va tras la descripción, no después de todas
              las reseñas, donde nadie veía el precio. En escritorio, cada
              bloque en su sitio. */}
          <div className="bg-superficie rounded-lg shadow-card overflow-hidden lg:col-span-2 lg:row-start-1">
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
              {/* Lo que escribe el profesional toma su propia dirección:
                    en árabe, un texto en castellano se leía al revés. Y
                    lleva su idioma: ver useIdiomaDelCatalogo. */}
              <h1
                dir="auto"
                lang={idiomaDelCatalogo}
                className="text-2xl font-bold text-principal"
              >
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
                <p
                  dir="auto"
                  lang={idiomaDelCatalogo}
                  className="text-secundario whitespace-pre-line"
                >
                  {service.description}
                </p>
              </div>
            </div>
          </div>

          {/* Columna lateral: reserva y proveedor */}
          <aside className="space-y-6 lg:col-start-3 lg:row-start-1 lg:row-span-2">
            {/* Por debajo de la cabecera, que también es fija: con top-4 la
                tarjeta se metía debajo de ella. */}
            <div className="bg-superficie rounded-lg shadow-card p-6 lg:sticky lg:top-20">
              <p className="mb-4 text-2xl font-bold text-principal">
                {priceLabel}
              </p>
              <p className="-mt-2 mb-4 flex items-center gap-1 text-sm text-secundario">
                <Clock size={14} aria-hidden="true" />
                {t('duracion', {
                  duracion: formatearDuracion(
                    service.durationMinutes ?? DURACION_POR_DEFECTO,
                    idioma,
                  ),
                })}
              </p>
              {/* Reservar es cosa de clientes: a los demás la API se lo
                  niega. A un profesional o a la administración se les
                  ofrecía igual, rellenaban el formulario entero y acababan
                  en un 403. Sin sesión se sigue ofreciendo: lleva a entrar. */}
              {!isAuthenticated || user?.role === UserRole.CLIENT ? (
                <Button onClick={handleBook} fullWidth size="lg">
                  <Calendar size={18} className="inline me-2" />
                  {t('reservar')}
                </Button>
              ) : (
                <p className="rounded-md bg-superficie-alt p-3 text-sm text-secundario">
                  {t('soloClientes')}
                </p>
              )}
              {/* Y contactar con uno mismo abría una conversación con nadie. */}
              {user?.id !== service.providerId && (
                <Button
                  onClick={handleContact}
                  variant="secondary"
                  fullWidth
                  className="mt-2"
                >
                  <MessageSquare size={18} className="inline me-2" />
                  {t('contactar')}
                </Button>
              )}
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
                <p
                  dir="auto"
                  lang={idiomaDelCatalogo}
                  className="mt-4 text-sm text-secundario"
                >
                  {service.provider.bio}
                </p>
              )}
            </div>
          </aside>

          {/* Reseñas */}
          <div
            id="valoraciones"
            className="bg-superficie rounded-lg shadow-card p-6 lg:col-span-2 lg:row-start-2"
          >
            <h2 className="text-lg font-semibold text-principal mb-4">
              {t('valoraciones', { total: reviews.length })}
            </h2>
            {reviews.length === 0 ? (
              <p className="text-secundario text-sm">{t('sinValoraciones')}</p>
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
                          <p
                            dir="auto"
                            lang={idiomaDelCatalogo}
                            className="mt-2 text-secundario text-sm"
                          >
                            {review.comment}
                          </p>
                        )}
                        {!review.providerResponse &&
                          user?.id === service.providerId && (
                            <RespuestaValoracion
                              reviewId={review.id}
                              onRespondida={(respuesta) =>
                                setReviews((actuales) =>
                                  actuales.map((r) =>
                                    r.id === review.id
                                      ? { ...r, providerResponse: respuesta }
                                      : r,
                                  ),
                                )
                              }
                            />
                          )}
                        {review.providerResponse && (
                          <div className="mt-3 ms-4 ps-3 border-s-2 border-primary-200">
                            <p className="text-xs font-medium text-tenue mb-1">
                              {t('respuestaProfesional')}
                            </p>
                            <p
                              dir="auto"
                              lang={idiomaDelCatalogo}
                              className="text-sm text-secundario"
                            >
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
      </div>
      <AsistenteBusqueda />
    </div>
  );
}
