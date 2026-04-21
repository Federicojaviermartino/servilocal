/**
 * Nivel atomico: Organismo
 * Componente: BookingForm (formulario de solicitud de reserva)
 */
'use client';
import { useState, FormEvent } from 'react';
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
    if (!date) errs.date = 'La fecha es obligatoria';
    if (!time) errs.time = 'La hora es obligatoria';
    if (price < service.priceMin) {
      errs.price = `El precio minimo es ${service.priceMin} euros`;
    }
    if (service.priceMax && price > service.priceMax) {
      errs.price = `El precio maximo es ${service.priceMax} euros`;
    }
    if (!description || description.length < 10) {
      errs.description = 'Describe brevemente el trabajo (minimo 10 caracteres)';
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
      <div className="grid grid-cols-2 gap-4">
        <Input
          type="date"
          label="Fecha"
          min={minDateStr}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
          required
        />
        <Input
          type="time"
          label="Hora"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          error={errors.time}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Descripcion del trabajo
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe brevemente el trabajo a realizar, ubicacion exacta, materiales necesarios..."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
        />
        {errors.description && (
          <p className="mt-1 text-sm text-danger-600">{errors.description}</p>
        )}
      </div>

      <Input
        type="number"
        label={`Precio acordado en euros (entre ${service.priceMin}${service.priceMax ? ` y ${service.priceMax}` : ''})`}
        min={service.priceMin}
        max={service.priceMax}
        step={5}
        value={price}
        onChange={(e) => setPrice(Number(e.target.value))}
        error={errors.price}
        hint="Este importe puede ajustarse tras hablar con el profesional."
        required
      />

      <div className="bg-neutral-50 rounded-md p-4 text-sm">
        <p className="font-medium text-neutral-900 mb-1">Resumen</p>
        <p className="text-neutral-700">Servicio: {service.title}</p>
        <p className="text-neutral-700">
          Fecha: {date} a las {time}
        </p>
        <p className="text-neutral-900 font-semibold mt-2">
          Total: {price} euros
        </p>
      </div>

      <Button
        type="submit"
        fullWidth
        size="lg"
        isLoading={isSubmitting}
        disabled={isSubmitting}
      >
        Continuar al pago
      </Button>
    </form>
  );
}
