/**
 * Nivel atomico: Organismo
 * Componente: ServiceForm (formulario de creacion/edicion de servicio)
 */
'use client';
import { useState, useEffect, FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Category, Service } from '@/types';
import { categoriesApi } from '@/lib/api';
import { CIUDADES } from '@/lib/ciudades';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import { useNombreCategoria } from '@/lib/categorias';
import { useNombreUnidad } from '@/lib/unidades';
import {
  DURACIONES,
  DURACION_POR_DEFECTO,
  formatearDuracion,
} from '@/lib/duracion';

/** Lo mínimo que Stripe cobra en euros, como en la API. */
const PRECIO_MINIMO = 0.5;

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
  const t = useTranslations('formularioServicio');
  const tComun = useTranslations('comun');
  const idioma = useLocale();
  const nombreUnidad = useNombreUnidad();
  const nombreCategoria = useNombreCategoria();
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
    durationMinutes: initial?.durationMinutes || DURACION_POR_DEFECTO,
  });
  const [errorPrecio, setErrorPrecio] = useState('');

  useEffect(() => {
    categoriesApi
      .getAll()
      .then((res) => setCategories(res.data || []))
      .catch(() => setCategories([]));
  }, []);

  // Al editar un servicio antiguo cuya ciudad no está en la lista, se añade
  // como opción para no perder el valor guardado al volver a enviar el formulario.
  const ciudadesDisponibles =
    form.city && !CIUDADES.includes(form.city)
      ? [...CIUDADES, form.city]
      : CIUDADES;

  // Lo mismo con una duración puesta desde la API que no esté en la lista.
  const duracionesDisponibles = DURACIONES.includes(form.durationMinutes)
    ? DURACIONES
    : [...DURACIONES, form.durationMinutes].sort((a, b) => a - b);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    // Un máximo por debajo del mínimo deja el servicio sin ningún importe
    // válido, y quien lo publica no tiene forma de enterarse: la ficha se ve
    // normal y es el cliente quien se encuentra con que no puede reservar.
    // El servidor lo tolera ignorando ese máximo; aquí se pide que se
    // arregle, que es lo que de verdad quería decir quien lo escribió.
    if (form.priceMax && form.priceMax < form.priceMin) {
      setErrorPrecio(t('rangoInvertido'));
      return;
    }

    // Lo mínimo que Stripe cobra: por debajo, el servicio se publicaba y
    // después nadie podía pagarlo.
    if (form.priceMin < PRECIO_MINIMO) {
      setErrorPrecio(t('precioMinimoStripe'));
      return;
    }

    setErrorPrecio('');
    onSubmit({
      ...form,
      priceMax: form.priceMax || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label={t('titulo')}
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        required
        maxLength={100}
      />
      <div>
        <label
          htmlFor="servicio-descripcion"
          className="block text-sm font-medium text-secundario mb-1"
        >
          {t('descripcion')}
        </label>
        <textarea
          id="servicio-descripcion"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
          required
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label
          htmlFor="servicio-categoria"
          className="block text-sm font-medium text-secundario mb-1"
        >
          {t('categoria')}
        </label>
        <select
          id="servicio-categoria"
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          required
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">{t('seleccionaCategoria')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {nombreCategoria(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          label={t('precioMinimo')}
          type="number"
          min={PRECIO_MINIMO}
          step={PRECIO_MINIMO}
          value={form.priceMin}
          onChange={(e) =>
            setForm({ ...form, priceMin: Number(e.target.value) })
          }
          required
        />
        <Input
          label={t('precioMaximo')}
          type="number"
          min={PRECIO_MINIMO}
          step={PRECIO_MINIMO}
          value={form.priceMax || ''}
          onChange={(e) =>
            setForm({ ...form, priceMax: Number(e.target.value) })
          }
          error={errorPrecio}
        />
        <div>
          <label
            htmlFor="servicio-unidad"
            className="block text-sm font-medium text-secundario mb-1"
          >
            {t('unidad')}
          </label>
          <select
            id="servicio-unidad"
            value={form.priceUnit}
            onChange={(e) => setForm({ ...form, priceUnit: e.target.value })}
            className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="por hora">{nombreUnidad('por hora')}</option>
            <option value="por servicio">{nombreUnidad('por servicio')}</option>
            <option value="por dia">{nombreUnidad('por dia')}</option>
            <option value="por visita">{nombreUnidad('por visita')}</option>
          </select>
        </div>
      </div>
      <div>
        <label
          htmlFor="servicio-duracion"
          className="block text-sm font-medium text-secundario mb-1"
        >
          {t('duracion')}
        </label>
        <select
          id="servicio-duracion"
          value={form.durationMinutes}
          onChange={(e) =>
            setForm({ ...form, durationMinutes: Number(e.target.value) })
          }
          aria-describedby="servicio-duracion-pista"
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {duracionesDisponibles.map((minutos) => (
            <option key={minutos} value={minutos}>
              {formatearDuracion(minutos, idioma)}
            </option>
          ))}
        </select>
        <p id="servicio-duracion-pista" className="mt-1 text-sm text-tenue">
          {t('duracionPista')}
        </p>
      </div>
      <Input
        label={t('direccion')}
        value={form.address}
        onChange={(e) => setForm({ ...form, address: e.target.value })}
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="servicio-ciudad"
            className="block text-sm font-medium text-secundario mb-1"
          >
            {tComun('ciudad')}
          </label>
          <select
            id="servicio-ciudad"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            required
            className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('seleccionaCiudad')}</option>
            {ciudadesDisponibles.map((ciudad) => (
              <option key={ciudad} value={ciudad}>
                {ciudad}
              </option>
            ))}
          </select>
        </div>
        <Input
          label={t('radio')}
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
          {tComun('cancelar')}
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {initial?.id ? t('guardarCambios') : t('crearServicio')}
        </Button>
      </div>
    </form>
  );
}
