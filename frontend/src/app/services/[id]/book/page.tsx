'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Service } from '@/types';
import { servicesApi, bookingsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import BookingForm from '@/components/organisms/BookingForm';
import Spinner from '@/components/atoms/Spinner';

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;
  const { isAuthenticated, loadFromStorage } = useAuthStore();

  const [service, setService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('accessToken');
        if (!stored) {
          router.push(`/auth/login?redirect=/services/${serviceId}/book`);
          return;
        }
      }
      return;
    }
    servicesApi
      .getById(serviceId)
      .then((res) => setService(res.data))
      .catch(() => setService(null))
      .finally(() => setIsLoading(false));
  }, [serviceId, isAuthenticated, router]);

  const handleSubmit = async (data: {
    scheduledDate: string;
    description: string;
    totalPrice: number;
  }) => {
    if (!service) return;
    setIsSubmitting(true);
    try {
      const { data: booking } = await bookingsApi.create({
        serviceId: service.id,
        ...data,
      });
      toast.success('Reserva creada. Vamos al pago.');
      router.push(`/bookings/${booking.id}/payment`);
    } catch {
      toast.error('No se ha podido crear la reserva. Intentalo de nuevo.');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Servicio no disponible
        </h1>
      </div>
    );
  }

  return (
    <main className="bg-neutral-50 min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-neutral-900 mb-6">
          Reservar: {service.title}
        </h1>
        <div className="bg-white rounded-lg shadow-card p-6">
          <BookingForm
            service={service}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </main>
  );
}
