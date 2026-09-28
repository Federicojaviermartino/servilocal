/**
 * Nivel atomico: Organismo
 * Componente: BookingForm (formulario de solicitud de reserva)
 */
'use client';
import { useState, FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Service } from '@/types';
import { DURACION_POR_DEFECTO, formatearDuracion } from '@/lib/duracion';
import { useImporte } from '@/lib/importes';
import Button from '../atoms/Button';
import Input from '../atoms/Input';

/** La fecha de hoy más unos días, como la pide un campo de fecha: local. */
function diaLocal(dentroDe: number): string {
  const dia = new Date();
  dia.setDate(dia.getDate() + dentroDe);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dia.getFullYear()}-${dos(dia.getMonth() + 1)}-${dos(dia.getDate())}`;
}

/** La hora local de una fecha ISO, como la piden los campos. */
function partesLocales(iso: string): { fecha: string; hora: string } {
  const dia = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return {
    fecha: `${dia.getFullYear()}-${dos(dia.getMonth() + 1)}-${dos(dia.getDate())}`,
    hora: `${dos(dia.getHours())}:${dos(dia.getMinutes())}`,
  };
}

export interface DatosReserva {
  scheduledDate: string;
  description: string;
  totalPrice: number;
}

interface BookingFormProps {
  service: Service;
  onSubmit: (data: DatosReserva) => void;
  isSubmitting?: boolean;
  /** Lo que se estaba escribiendo cuando caducó la sesión. */
  inicial?: DatosReserva;
}

export default function BookingForm({
  service,
  onSubmit,
  isSubmitting = false,
  inicial,
}: BookingFormProps) {
  const t = useTranslations('reserva');
  const idioma = useLocale();
  const importe = useImporte();
  // En la fecha local, no en la UTC: pasada la medianoche en España, la UTC
  // todavía es ayer, y «mañana» salía hoy. Hasta un año vista, que es lo
  // que admite la API.
  const minDateStr = diaLocal(1);
  const maxDateStr = diaLocal(365);

  const [date, setDate] = useState(() =>
    inicial ? partesLocales(inicial.scheduledDate).fecha : minDateStr,
  );
  const [time, setTime] = useState(() =>
    inicial ? partesLocales(inicial.scheduledDate).hora : '10:00',
  );
  const [description, setDescription] = useState(inicial?.description ?? '');
  const [price, setPrice] = useState(inicial?.totalPrice ?? service.priceMin);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!date) errs.date = t('fechaObligatoria');
    else if (date < minDateStr || date > maxDateStr) {
      errs.date = t('fechaFueraDeRango');
    }
    if (!time) errs.time = t('horaObligatoria');
    if (price < service.priceMin) {
      errs.price = t('precioMinimo', { min: importe(service.priceMin) });
    }
    // El máximo solo manda si está por encima del mínimo. Si no, el servicio
    // se publicó con la horquilla al revés y aplicarlo dejaría la reserva sin
    // ningún importe posible: por debajo falla el mínimo y por encima el
    // máximo. El servidor hace lo mismo, y es deliberado.
    if (
      service.priceMax &&
      service.priceMax > service.priceMin &&
      price > service.priceMax
    ) {
      errs.price = t('precioMaximo', { max: importe(service.priceMax) });
    }
    if (!description || description.length < 10) {
      errs.description = t('descripcionCorta');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      scheduledDate: new Date(`${date}T${time}:00`).toISOString(),
      description,
      totalPrice: price,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          type="date"
          label={t('fecha')}
          min={minDateStr}
          max={maxDateStr}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
          required
        />
        <Input
          type="time"
          label={t('hora')}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          error={errors.time}
          required
        />
      </div>

      <div>
        <label
          htmlFor="reserva-descripcion"
          className="block text-sm font-medium text-secundario mb-1"
        >
          {t('descripcionTrabajo')}
        </label>
        <textarea
          id="reserva-descripcion"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder={t('descripcionPlaceholder')}
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? 'reserva-descripcion-error' : undefined
          }
        />
        {errors.description && (
          <p
            id="reserva-descripcion-error"
            className="mt-1 text-sm text-danger-600"
          >
            {errors.description}
          </p>
        )}
      </div>

      <Input
        type="number"
        label={
          service.priceMax
            ? t('precioRango', {
                min: importe(service.priceMin),
                max: importe(service.priceMax),
              })
            : t('precioMinimoEtiqueta', { min: importe(service.priceMin) })
        }
        min={service.priceMin}
        max={service.priceMax}
        step={5}
        value={price}
        onChange={(e) => setPrice(Number(e.target.value))}
        error={errors.price}
        hint={t('precioPista')}
        required
      />

      <div className="bg-fondo rounded-md p-4 text-sm">
        <p className="font-medium text-principal mb-1">{t('resumen')}</p>
        <p className="text-secundario">
          {t('resumenServicio', { titulo: service.title })}
        </p>
        <p className="text-secundario">
          {t('resumenFecha', { fecha: date, hora: time })}
        </p>
        <p className="text-secundario">
          {t('resumenDuracion', {
            duracion: formatearDuracion(
              service.durationMinutes ?? DURACION_POR_DEFECTO,
              idioma,
            ),
          })}
        </p>
        <p className="text-principal font-semibold mt-2">
          {t('resumenTotal', { precio: importe(price) })}
        </p>
      </div>

      <Button
        type="submit"
        fullWidth
        size="lg"
        isLoading={isSubmitting}
        disabled={isSubmitting}
      >
        {t('continuar')}
      </Button>
    </form>
  );
}
