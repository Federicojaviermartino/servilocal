/**
 * Nivel atomico: Organismo
 * Componente: FilterPanel (filtros laterales de busqueda)
 */
'use client';
import { useState, useEffect } from 'react';
import { Category, ServiceSearchParams } from '@/types';
import { categoriesApi } from '@/lib/api';
import Button from '../atoms/Button';
import RatingStars from '../molecules/RatingStars';

interface FilterPanelProps {
  initial?: ServiceSearchParams;
  onApply: (filters: ServiceSearchParams) => void;
}

export default function FilterPanel({ initial = {}, onApply }: FilterPanelProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(initial.categoryId || '');
  const [city, setCity] = useState(initial.city || '');
  const [radiusKm, setRadiusKm] = useState(initial.radiusKm || 10);
  const [minRating, setMinRating] = useState(initial.minRating || 0);
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice || 0);

  useEffect(() => {
    categoriesApi
      .getAll()
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  }, []);

  const handleApply = () => {
    onApply({
      categoryId: categoryId || undefined,
      city: city || undefined,
      radiusKm: radiusKm || undefined,
      minRating: minRating || undefined,
      maxPrice: maxPrice || undefined,
    });
  };

  const handleReset = () => {
    setCategoryId('');
    setCity('');
    setRadiusKm(10);
    setMinRating(0);
    setMaxPrice(0);
    onApply({});
  };

  return (
    <aside className="bg-white rounded-lg shadow-card p-5 space-y-5">
      <h2 className="font-semibold text-neutral-900">Filtros</h2>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Categoria
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todas las categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Ciudad
        </label>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todas las ciudades</option>
          {[
            'Madrid',
            'Barcelona',
            'Valencia',
            'Sevilla',
            'Zaragoza',
            'Malaga',
            'Bilbao',
            'Murcia',
            'Palma',
            'Las Palmas de Gran Canaria',
          ].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Radio de busqueda: {radiusKm} km
        </label>
        <input
          type="range"
          min={1}
          max={50}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          className="w-full accent-primary-600"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">
          Valoracion minima
        </label>
        <RatingStars
          rating={minRating}
          interactive
          onChange={setMinRating}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Precio maximo (euros)
        </label>
        <input
          type="number"
          min={0}
          value={maxPrice || ''}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          placeholder="Sin limite"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <Button onClick={handleApply} fullWidth>
          Aplicar filtros
        </Button>
        <Button onClick={handleReset} variant="ghost" fullWidth>
          Limpiar
        </Button>
      </div>
    </aside>
  );
}
