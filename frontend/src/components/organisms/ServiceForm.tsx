/**
 * Nivel atomico: Organismo
 * Componente: ServiceForm (formulario de creacion/edicion de servicio)
 */
'use client';
import { useState, useEffect, FormEvent } from 'react';
import { Category, Service } from '@/types';
import { categoriesApi } from '@/lib/api';
import Input from '../atoms/Input';
import Button from '../atoms/Button';

interface ServiceFormProps {
  initial?: Partial<Service>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ServiceForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
}: ServiceFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    categoryId: initial?.categoryId || '',
    priceMin: initial?.priceMin || 20,
    priceMax: initial?.priceMax || 0,
    priceUnit: initial?.priceUnit || 'por hora',
    address: initial?.address || '',
    city: initial?.city || '',
    coverageRadiusKm: initial?.coverageRadiusKm || 10,
  });

  useEffect(() => {
    categoriesApi
      .getAll()
      .then((res) => setCategories(res.data || []))
      .catch(() => setCategories([]));
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      priceMax: form.priceMax || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Titulo del servicio"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        required
        maxLength={100}
      />
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Descripcion
        </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Categoria
        </label>
        <select
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Selecciona una categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Precio minimo (euros)"
          type="number"
          min={0}
          step={5}
          value={form.priceMin}
          onChange={(e) => setForm({ ...form, priceMin: Number(e.target.value) })}
          required
        />
        <Input
          label="Precio maximo (opcional)"
          type="number"
          min={0}
          step={5}
          value={form.priceMax || ''}
          onChange={(e) => setForm({ ...form, priceMax: Number(e.target.value) })}
        />
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Unidad
          </label>
          <select
            value={form.priceUnit}
            onChange={(e) => setForm({ ...form, priceUnit: e.target.value })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="por hora">por hora</option>
            <option value="por servicio">por servicio</option>
            <option value="por dia">por dia</option>
            <option value="por visita">por visita</option>
          </select>
        </div>
      </div>
      <Input
        label="Direccion de referencia"
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Ciudad"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          required
        />
        <Input
          label="Radio de cobertura (km)"
          type="number"
          min={1}
          max={100}
          value={form.coverageRadiusKm}
          onChange={(e) =>
            setForm({ ...form, coverageRadiusKm: Number(e.target.value) })
          }
          required
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {initial?.id ? 'Guardar cambios' : 'Crear servicio'}
        </Button>
      </div>
    </form>
  );
}
