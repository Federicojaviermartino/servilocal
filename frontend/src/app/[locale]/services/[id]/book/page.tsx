'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import toast from 'react-hot-toast';
import { Service } from '@/types';
import { servicesApi, bookingsApi } from '@/lib/api';
import { haySesionRecordada, useAuthStore } from '@/lib/auth-store';
import BookingForm from '@/components/organisms/BookingForm';
import Spinner from '@/components/atoms/Spinner';
import {
  CODIGO_DEMOSTRACION,
  codigoDeError,
  textoDeError,
} from '@/lib/errores-api';

export default function BookingPage() {
  const t = useTranslations('reserva');
  const tComun = useTranslations('comun');
  const tErrores = useTranslations('erroresApi');
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
      if (!haySesionRecordada()) {
        router.push(`/auth/login?redirect=/services/${serviceId}/book`);
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
      toast.success(t('creada'));
      router.push(`/bookings/${booking.id}/payment`);
    } catch (error) {
      toast.error(
        codigoDeError(error) === CODIGO_DEMOSTRACION
          ? tComun('demostracionAislada')
          : textoDeError(error, tErrores, t('errorCrear')),
      );
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
        <h1 className="text-2xl font-semibold text-principal">
          {t('servicioNoDisponible')}
        </h1>
      </div>
    );
  }

  return (
    <main className="bg-fondo min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-principal mb-6">
          {t('titulo', { servicio: service.title })}
        </h1>
        <div className="bg-superficie rounded-lg shadow-card p-6">
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
