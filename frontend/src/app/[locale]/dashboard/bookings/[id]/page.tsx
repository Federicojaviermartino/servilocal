'use client';
import { useState, useEffect, useCallback } from 'react';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import toast from 'react-hot-toast';
import { Calendar, MapPin, ArrowLeft } from 'lucide-react';
import {
  Booking,
  BookingStatus,
  Payment,
  PaymentStatus,
  UserRole,
} from '@/types';
import { CLAVE_ESTADO, VARIANTE_ESTADO } from '@/lib/estados';
import { bookingsApi, paymentsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Badge from '@/components/atoms/Badge';
import Avatar from '@/components/atoms/Avatar';
import Button from '@/components/atoms/Button';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useCarga } from '@/lib/carga';

/** Un pago en estos estados no retiene nada: se puede volver a pagar. */
const SIN_RETENER = [PaymentStatus.PENDING, PaymentStatus.FAILED];

export default function BookingDetailPage() {
  const t = useTranslations('reservasPanel');
  const tComun = useTranslations('comun');
  const tEstados = useTranslations('estados');
  const idioma = useLocale();
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;
  const { user } = useAuthStore();

  const [isUpdating, setIsUpdating] = useState(false);

  // Un fallo aquí se veía como «reserva no encontrada», que es una respuesta
  // distinta y lleva a cerrar la pantalla en vez de volver a intentarlo.
  const {
    datos: booking,
    estado,
    reintentar: load,
    referencia,
  } = useCarga<Booking>(() => bookingsApi.getById(bookingId), [bookingId]);

  // El pago decide si hay algo que pagar. Una reserva confirmada cuya
  // retención se ha perdido tiene que poder volver a autorizarse desde aquí,
  // y una ya retenida no debe ofrecer pagar otra vez.
  const { datos: pago, estado: estadoPago } = useCarga<Payment | ''>(
    () => paymentsApi.getByBooking(bookingId),
    [bookingId],
  );

  const changeStatus = async (status: BookingStatus) => {
    setIsUpdating(true);
    try {
      await bookingsApi.updateStatus(bookingId, status);
      toast.success(t('actualizada'));
      load();
    } catch {
      toast.error(t('errorActualizar'));
    } finally {
      setIsUpdating(false);
    }
  };

  if (estado !== 'listo' || !booking || !user) {
    return (
      <EstadoCarga estado={estado} onReintentar={load} referencia={referencia}>
        <div className="bg-superficie rounded-lg shadow-card p-10 text-center text-secundario">
          {t('noEncontrada')}
        </div>
      </EstadoCarga>
    );
  }

  const isClient = user.role === UserRole.CLIENT;
  const isProvider = user.role === UserRole.PROVIDER;
  const counterpart = isProvider ? booking.client : booking.provider;
  const backHref = isProvider
    ? '/dashboard/bookings-received'
    : '/dashboard/bookings';
  const date = new Date(booking.scheduledDate);

  const abierta =
    booking.status === BookingStatus.PENDING ||
    booking.status === BookingStatus.CONFIRMED;
  // Sin saber del pago, lo de antes: solo mientras está pendiente.
  const faltaPagar =
    estadoPago === 'listo'
      ? !pago || SIN_RETENER.includes(pago.status)
      : booking.status === BookingStatus.PENDING;
  const canClientPay = isClient && abierta && faltaPagar;
  const canProviderDecide =
    isProvider && booking.status === BookingStatus.PENDING;
  const canProviderComplete =
    isProvider && booking.status === BookingStatus.CONFIRMED;
  const canCancel =
    abierta && (booking.clientId === user.id || booking.providerId === user.id);

  return (
    <div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-secundario hover:text-acento mb-4"
      >
        <ArrowLeft size={16} />
        {tComun('volver')}
      </Link>

      <div className="bg-superficie rounded-lg shadow-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant={VARIANTE_ESTADO[booking.status]}>
            {tEstados(CLAVE_ESTADO[booking.status])}
          </Badge>
          <span className="text-xs text-tenue">#{booking.id.slice(0, 8)}</span>
        </div>

        <h1 className="text-2xl font-bold text-principal mb-4">
          {booking.service.title}
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-secundario mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={16} />
            <span>
              {t('fechaYHora', {
                fecha: date.toLocaleDateString(idioma, {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                }),
                hora: date.toLocaleTimeString(idioma, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </span>
          </div>
          {booking.service.city && (
            <div className="flex items-center gap-2">
              <MapPin size={16} />
              <span>{booking.service.city}</span>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-principal mb-2">
            {t('descripcion')}
          </h2>
          <p className="text-secundario whitespace-pre-line">
            {booking.description || t('sinDescripcion')}
          </p>
        </div>

        <div className="bg-fondo rounded-md p-4 mb-6">
          <h2 className="text-sm font-semibold text-principal mb-3">
            {isProvider ? tComun('cliente') : tComun('profesional')}
          </h2>
          <div className="flex items-center gap-3">
            <Avatar
              name={`${counterpart.firstName} ${counterpart.lastName}`}
              size="md"
            />
            <div>
              <p className="font-medium text-principal">
                {counterpart.firstName} {counterpart.lastName}
              </p>
              {counterpart.phone && (
                <p className="text-sm text-secundario">{counterpart.phone}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-borde pt-4 mb-6">
          <span className="text-secundario">{t('importe')}</span>
          <span className="text-2xl font-bold text-principal">
            {t('importeEnEuros', { importe: booking.totalPrice })}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {canClientPay && (
            <Button
              onClick={() => router.push(`/bookings/${booking.id}/payment`)}
            >
              {t('pagarAhora')}
            </Button>
          )}
          {canProviderDecide && (
            <>
              <Button
                variant="secondary"
                onClick={() => changeStatus(BookingStatus.REJECTED)}
                disabled={isUpdating}
              >
                {t('rechazar')}
              </Button>
              <Button
                onClick={() => changeStatus(BookingStatus.CONFIRMED)}
                disabled={isUpdating}
              >
                {t('confirmar')}
              </Button>
            </>
          )}
          {canProviderComplete && (
            <Button
              onClick={() => changeStatus(BookingStatus.COMPLETED)}
              disabled={isUpdating}
            >
              {t('completar')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="secondary"
              onClick={() => changeStatus(BookingStatus.CANCELLED)}
              disabled={isUpdating}
            >
              {t('cancelar')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
