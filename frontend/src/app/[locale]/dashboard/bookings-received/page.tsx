'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Booking, BookingStatus } from '@/types';
import { CLAVE_ESTADO, VARIANTE_ESTADO } from '@/lib/estados';
import { bookingsApi } from '@/lib/api';
import { cambiarEstadoReserva } from '@/lib/cambiar-estado';
import { textoDeError } from '@/lib/errores-api';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';
import Avatar from '@/components/atoms/Avatar';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useCarga } from '@/lib/carga';
import { useAhora } from '@/lib/ahora';

export default function BookingsReceivedPage() {
  const t = useTranslations('reservasPanel');
  const tEstados = useTranslations('estados');
  const tErrores = useTranslations('erroresApi');
  const idioma = useLocale();
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');
  const ahora = useAhora();

  // Antes un fallo dejaba la lista vacía, y el profesional leía «no tienes
  // reservas» cuando lo que pasaba era que no se había podido preguntar.
  const { datos, estado, reintentar, referencia } = useCarga<Booking[]>(
    () => bookingsApi.getReceived(),
    [],
  );
  const bookings = datos ?? [];

  const handleStatusChange = async (id: string, status: BookingStatus) => {
    try {
      const hecho = await cambiarEstadoReserva(id, status, () =>
        window.confirm(t('completarSinCobro')),
      );
      if (!hecho) {
        toast(t('esperandoPago'));
        return;
      }
      toast.success(t('actualizada'));
      reintentar();
    } catch (error) {
      toast.error(textoDeError(error, tErrores, t('errorActualizar')));
    }
  };

  const filtered =
    filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const tabs: { id: 'all' | BookingStatus; label: string }[] = [
    { id: 'all', label: tEstados('todas') },
    { id: BookingStatus.PENDING, label: tEstados('pendientes') },
    { id: BookingStatus.CONFIRMED, label: tEstados('confirmadas') },
    { id: BookingStatus.COMPLETED, label: tEstados('completadas') },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-principal mb-6">
        {t('reservasRecibidas')}
      </h1>

      <div className="bg-superficie rounded-lg shadow-card p-1 mb-4 inline-flex max-w-full flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-4 py-2 text-sm rounded-md ${
              filter === t.id
                ? 'bg-primary-600 text-white'
                : 'text-secundario hover:bg-fondo'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <EstadoCarga
        estado={estado}
        onReintentar={reintentar}
        referencia={referencia}
      >
        {filtered.length === 0 ? (
          <div className="bg-superficie rounded-lg shadow-card p-10 text-center text-secundario">
            {t('sinReservas')}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => {
              const date = new Date(b.scheduledDate);
              return (
                <div
                  key={b.id}
                  className="bg-superficie rounded-lg shadow-card p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={VARIANTE_ESTADO[b.status]}>
                          {tEstados(CLAVE_ESTADO[b.status])}
                        </Badge>
                        <span className="text-xs text-tenue">
                          #{b.id.slice(0, 8)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-principal">
                        {b.service.title}
                      </h3>
                      <p className="text-sm text-secundario mt-1">
                        {/* «a las» estaba escrito aquí en castellano, y en
                            cualquier otro idioma salía mezclado. */}
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
                      </p>
                      {b.description && (
                        <p className="mt-2 text-sm text-secundario bg-fondo rounded p-2">
                          {b.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <Avatar
                          name={`${b.client.firstName} ${b.client.lastName}`}
                          size="sm"
                        />
                        <span className="text-sm text-secundario">
                          {b.client.firstName} {b.client.lastName}
                        </span>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-principal whitespace-nowrap">
                      {t('importeEnEuros', { importe: b.totalPrice })}
                    </p>
                  </div>

                  {b.status === BookingStatus.PENDING && (
                    <div className="mt-4 pt-4 border-t border-borde flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleStatusChange(b.id, BookingStatus.REJECTED)
                        }
                      >
                        {t('rechazar')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          handleStatusChange(b.id, BookingStatus.CONFIRMED)
                        }
                      >
                        {t('aceptar')}
                      </Button>
                    </div>
                  )}
                  {b.status === BookingStatus.CONFIRMED && (
                    <div className="mt-4 pt-4 border-t border-borde flex justify-end">
                      {/* Completar es cobrar: antes de la fecha, no se
                          ofrece. */}
                      {new Date(b.scheduledDate).getTime() <= ahora ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            handleStatusChange(b.id, BookingStatus.COMPLETED)
                          }
                        >
                          {t('completar')}
                        </Button>
                      ) : (
                        <p className="text-sm text-secundario">
                          {t('completarDesde')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </EstadoCarga>
    </div>
  );
}
