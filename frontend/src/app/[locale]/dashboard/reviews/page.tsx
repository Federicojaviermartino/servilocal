'use client';
import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Booking, BookingStatus, Review } from '@/types';
import { bookingsApi, reviewsApi } from '@/lib/api';
import Spinner from '@/components/atoms/Spinner';
import Button from '@/components/atoms/Button';
import RatingStars from '@/components/molecules/RatingStars';

interface PendingReviewFormProps {
  booking: Booking;
  onSubmit: () => void;
}

function PendingReviewForm({ booking, onSubmit }: PendingReviewFormProps) {
  const t = useTranslations('valoracionesPanel');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating < 1) {
      toast.error(t('selecciona'));
      return;
    }
    setIsSubmitting(true);
    try {
      await reviewsApi.create({
        bookingId: booking.id,
        serviceId: booking.serviceId,
        rating,
        comment: comment || undefined,
      });
      toast.success(t('enviada'));
      onSubmit();
    } catch {
      toast.error(t('errorEnviar'));
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
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
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

export default function MyReviewsPage() {
  const t = useTranslations('valoracionesPanel');
  const idioma = useLocale();
  const [pending, setPending] = useState<Booking[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const [bkRes, rvRes] = await Promise.all([
        bookingsApi.getMyBookings(),
        reviewsApi.getMyReviews(),
      ]);
      const completed: Booking[] = (bkRes.data || []).filter(
        (b: Booking) => b.status === BookingStatus.COMPLETED,
      );
      const reviewed = new Set(
        (rvRes.data || []).map((r: Review) => r.bookingId),
      );
      setPending(completed.filter((b) => !reviewed.has(b.id)));
      setReviews(rvRes.data || []);
    } catch {
      setPending([]);
      setReviews([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
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
              <PendingReviewForm key={b.id} booking={b} onSubmit={load} />
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
  );
}
