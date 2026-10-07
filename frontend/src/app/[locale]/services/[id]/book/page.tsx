'use client';
import { useState, useEffect } from 'react';
import type { AxiosError } from 'axios';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import toast from 'react-hot-toast';
import { Service, UserRole } from '@/types';
import { servicesApi, bookingsApi } from '@/lib/api';
import { haySesionRecordada, useAuthStore } from '@/lib/auth-store';
import BookingForm, { DatosReserva } from '@/components/organisms/BookingForm';
import Spinner from '@/components/atoms/Spinner';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useAvisoDeFallo } from '@/lib/aviso-de-fallo';
import { useBorrador } from '@/lib/borrador';
import { referenciaDe } from '@/lib/carga';

/**
 * Lo que puede pasar al pedir el servicio, que no es lo mismo: un corte de
 * red, la API dormida o la sesión caducada se decían «servicio no
 * disponible», y no dejaban reintentar. Solo un 404 es que no está.
 */
type Carga =
  | { servicio: Service }
  | { fallo: 'no-existe' }
  | { fallo: 'error' | 'sesion'; referencia?: string };

export default function BookingPage() {
  const t = useTranslations('reserva');
  const tComun = useTranslations('comun');
  const avisarFallo = useAvisoDeFallo();
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;
  const borrador = useBorrador<DatosReserva>(`reserva:${serviceId}`);
  const { isAuthenticated, loadFromStorage, user } = useAuthStore();
  // Solo reserva un cliente. Quien llega aquí con otra cuenta —por un enlace
  // guardado, porque la ficha ya no se lo ofrece— vuelve a la ficha en vez
  // de rellenar un formulario que la API le va a rechazar.
  const sinPermiso = Boolean(user) && user?.role !== UserRole.CLIENT;

  const [carga, setCarga] = useState<Carga | null>(null);
  const [intento, setIntento] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const service = carga && 'servicio' in carga ? carga.servicio : null;

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
    if (sinPermiso) {
      router.replace(`/services/${serviceId}`);
      return;
    }
    let vigente = true;
    servicesApi.getById(serviceId).then(
      (res) => {
        if (vigente) setCarga({ servicio: res.data });
      },
      (error: AxiosError) => {
        if (!vigente) return;
        const estado = error?.response?.status;
        setCarga(
          estado === 404
            ? { fallo: 'no-existe' }
            : {
                fallo: estado === 401 ? 'sesion' : 'error',
                referencia: referenciaDe(error),
              },
        );
      },
    );
    return () => {
      vigente = false;
    };
  }, [serviceId, isAuthenticated, sinPermiso, router, intento]);

  const reintentar = () => {
    setCarga(null);
    setIntento((n) => n + 1);
  };

  const handleSubmit = async (data: DatosReserva) => {
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
      // Con la sesión caducada, lo escrito se guarda para después de entrar.
      avisarFallo(error, t('errorCrear'), () => borrador.guardar(data));
      setIsSubmitting(false);
    }
  };

  if (!carga) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if ('fallo' in carga && carga.fallo !== 'no-existe') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <EstadoCarga
          estado={carga.fallo}
          onReintentar={reintentar}
          referencia={carga.referencia}
        />
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
    <div className="bg-fondo min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-principal mb-6">
          {t('titulo', { servicio: service.title })}
        </h1>
        {borrador.recuperado && (
          <p role="status" className="mb-4 text-sm text-secundario">
            {tComun('borradorRecuperado')}
          </p>
        )}
        <div className="bg-superficie rounded-lg shadow-card p-6">
          <BookingForm
            service={service}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            inicial={borrador.recuperado ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
