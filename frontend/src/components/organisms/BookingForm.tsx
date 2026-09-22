/**
 * Nivel atomico: Organismo
 * Componente: BookingForm (formulario de solicitud de reserva)
 */
'use client';
import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Service } from '@/types';
import Button from '../atoms/Button';
import Input from '../atoms/Input';

interface BookingFormProps {
  service: Service;
  onSubmit: (data: {
    scheduledDate: string;
    description: string;
    totalPrice: number;
  }) => void;
  isSubmitting?: boolean;
}

export default function BookingForm({
  service,
  onSubmit,
  isSubmitting = false,
}: BookingFormProps) {
  const t = useTranslations('reserva');
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  const [date, setDate] = useState(minDateStr);
  const [time, setTime] = useState('10:00');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(service.priceMin);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!date) errs.date = t('fechaObligatoria');
    if (!time) errs.time = t('horaObligatoria');
    if (price < service.priceMin) {
      errs.price = t('precioMinimo', { min: service.priceMin });
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
      errs.price = t('precioMaximo', { max: service.priceMax });
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
        />
        {errors.description && (
          <p className="mt-1 text-sm text-danger-600">{errors.description}</p>
        )}
      </div>

      <Input
        type="number"
        label={
          service.priceMax
            ? t('precioRango', {
                min: service.priceMin,
                max: service.priceMax,
              })
            : t('precioMinimoEtiqueta', { min: service.priceMin })
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
        <p className="text-principal font-semibold mt-2">
          {t('resumenTotal', { precio: price })}
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
