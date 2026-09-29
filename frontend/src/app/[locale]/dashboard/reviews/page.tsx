'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Booking, BookingStatus, Review } from '@/types';
import { bookingsApi, reviewsApi } from '@/lib/api';
import Button from '@/components/atoms/Button';
import RatingStars from '@/components/molecules/RatingStars';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useCarga } from '@/lib/carga';
import { useAvisoDeFallo } from '@/lib/aviso-de-fallo';
import { useBorrador } from '@/lib/borrador';

interface PendingReviewFormProps {
  booking: Booking;
  /** Con la valoración que ha guardado la API. */
  onSubmit: (valoracion: Review) => void;
}

function PendingReviewForm({ booking, onSubmit }: PendingReviewFormProps) {
  const t = useTranslations('valoracionesPanel');
  const tComun = useTranslations('comun');
  const avisarFallo = useAvisoDeFallo();
  const borrador = useBorrador<{ rating: number; comment: string }>(
    `valoracion:${booking.id}`,
  );
  const [rating, setRating] = useState(borrador.recuperado?.rating ?? 5);
  const [comment, setComment] = useState(borrador.recuperado?.comment ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating < 1) {
      toast.error(t('selecciona'));
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: guardada } = await reviewsApi.create({
        bookingId: booking.id,
        serviceId: booking.serviceId,
        rating,
        comment: comment || undefined,
      });
      toast.success(t('enviada'));
      onSubmit(guardada);
    } catch (error) {
      avisarFallo(error, t('errorEnviar'), () =>
        borrador.guardar({ rating, comment }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-superficie rounded-lg shadow-card p-5">
      <p className="font-medium text-principal">{booking.service.title}</p>
      <p className="text-sm text-secundario mt-1">
        {t('con', {
          nombre: `${booking.provider.firstName} ${booking.provider.lastName}`,
        })}
      </p>
      <div className="mt-3">
        <p className="text-sm font-medium text-secundario mb-2">
          {t('tuValoracion')}
        </p>
        <RatingStars
          rating={rating}
          size="lg"
          interactive
          onChange={setRating}
        />
      </div>
      {borrador.recuperado && (
        <p role="status" className="mt-3 text-sm text-secundario">
          {tComun('borradorRecuperado')}
        </p>
      )}
      {/* Solo tenía el texto de ejemplo, que desaparece al escribir y no
          todos los lectores anuncian: sin nombre accesible. */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        aria-label={t('comentarioPlaceholder')}
        placeholder={t('comentarioPlaceholder')}
        className="mt-3 w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <div className="mt-3 flex justify-end">
        <Button onClick={handleSubmit} isLoading={isSubmitting}>
          {t('enviar')}
        </Button>
      </div>
    </div>
  );
}

interface Valoraciones {
  /** Reservas completadas que aún no tienen valoración. */
  pendientes: Booking[];
  enviadas: Review[];
}

async function pedirValoraciones(): Promise<{ data: Valoraciones }> {
  const [bkRes, rvRes] = await Promise.all([
    bookingsApi.getMyBookings(),
    reviewsApi.getMyReviews(),
  ]);
  const enviadas: Review[] = rvRes.data || [];
  const valoradas = new Set(enviadas.map((r) => r.bookingId));
  const pendientes = (bkRes.data || []).filter(
    (b: Booking) =>
      b.status === BookingStatus.COMPLETED && !valoradas.has(b.id),
  );
  return { data: { pendientes, enviadas } };
}

export default function MyReviewsPage() {
  const t = useTranslations('valoracionesPanel');
  const idioma = useLocale();
  // Antes un fallo vaciaba las dos listas, y quien tenía valoraciones
  // pendientes leía que no le quedaba ninguna.
  const { datos, estado, reintentar, referencia } = useCarga(
    pedirValoraciones,
    [],
  );
  // Lo enviado desde que se abrió la pantalla. Antes, cada envío volvía a
  // pedirlo todo: mientras cargaba se desmontaban los demás formularios, y
  // lo que se estuviera escribiendo en otra valoración se perdía.
  const [recientes, setRecientes] = useState<Review[]>([]);
  const valoradas = new Set(recientes.map((r) => r.bookingId));
  const pending = (datos?.pendientes ?? []).filter((b) => !valoradas.has(b.id));
  const reviews = [...recientes, ...(datos?.enviadas ?? [])];

  return (
    <EstadoCarga
      estado={estado}
      onReintentar={reintentar}
      referencia={referencia}
    >
      <div className="space-y-8">
        <section>
          <h1 className="text-2xl font-bold text-principal mb-4">
            {t('pendientes')}
          </h1>
          {pending.length === 0 ? (
            <p className="text-secundario text-sm">{t('sinPendientes')}</p>
          ) : (
            <div className="space-y-4">
              {pending.map((b) => (
                <PendingReviewForm
                  key={b.id}
                  booking={b}
                  onSubmit={(valoracion) =>
                    setRecientes((antes) => [valoracion, ...antes])
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold text-principal mb-4">
            {t('enviadas', { total: reviews.length })}
          </h2>
          {reviews.length === 0 ? (
            <p className="text-secundario text-sm">{t('sinEnviadas')}</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className="bg-superficie rounded-lg shadow-card p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <RatingStars rating={r.rating} size="sm" />
                    <span className="text-xs text-tenue">
                      {new Date(r.createdAt).toLocaleDateString(idioma)}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-secundario">{r.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </EstadoCarga>
  );
}
