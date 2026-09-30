/**
 * Nivel atómico: Organismo
 * Componente: FilterPanel (filtros laterales de búsqueda)
 */
'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { LocateFixed } from 'lucide-react';
import { Category, ServiceSearchParams } from '@/types';
import { categoriesApi } from '@/lib/api';
import { CIUDADES } from '@/lib/ciudades';
import { redondearCoordenada } from '@/lib/busqueda';
import Button from '../atoms/Button';
import RatingStars from '../molecules/RatingStars';
import { useNombreCategoria } from '@/lib/categorias';

interface FilterPanelProps {
  initial?: ServiceSearchParams;
  onApply: (filters: ServiceSearchParams) => void;
}

interface Punto {
  latitude: number;
  longitude: number;
}

type EstadoUbicacion = 'inactiva' | 'buscando' | 'fallida';

export default function FilterPanel({
  initial = {},
  onApply,
}: FilterPanelProps) {
  const t = useTranslations('filtros');
  const nombreCategoria = useNombreCategoria();
  const tResultados = useTranslations('resultados');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(initial.categoryId || '');
  const [city, setCity] = useState(initial.city || '');
  const [punto, setPunto] = useState<Punto | null>(
    initial.latitude !== undefined && initial.longitude !== undefined
      ? { latitude: initial.latitude, longitude: initial.longitude }
      : null,
  );
  const [ubicacion, setUbicacion] = useState<EstadoUbicacion>('inactiva');
  const [radiusKm, setRadiusKm] = useState(initial.radiusKm || 10);
  const [minRating, setMinRating] = useState(initial.minRating || 0);
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice || 0);

  useEffect(() => {
    categoriesApi
      .getAll()
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  }, []);

  /**
   * El radio se aplica alrededor de un punto, y el panel no tenía ninguno:
   * lo mandaba sin coordenadas y la API lo ignoraba, así que alguien en
   * Valencia ponía 5 km y recibía resultados de toda España. Ahora el punto
   * es la ubicación del navegador, si se pide, y sin ella no hay radio.
   */
  const localizar = () => {
    if (!('geolocation' in navigator)) {
      setUbicacion('fallida');
      return;
    }
    setUbicacion('buscando');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPunto({
          latitude: redondearCoordenada(coords.latitude),
          longitude: redondearCoordenada(coords.longitude),
        });
        setUbicacion('inactiva');
      },
      () => setUbicacion('fallida'),
      { timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  };

  const handleApply = () => {
    onApply({
      categoryId: categoryId || undefined,
      city: city || undefined,
      latitude: punto?.latitude,
      longitude: punto?.longitude,
      radiusKm: punto ? radiusKm : undefined,
      minRating: minRating || undefined,
      maxPrice: maxPrice || undefined,
    });
  };

  const handleReset = () => {
    setCategoryId('');
    setCity('');
    setPunto(null);
    setUbicacion('inactiva');
    setRadiusKm(10);
    setMinRating(0);
    setMaxPrice(0);
    // El buscador fusiona lo que recibe sobre los filtros vigentes, de modo
    // que un objeto vacío no borraría nada: hay que anular cada campo.
    onApply({
      categoryId: undefined,
      city: undefined,
      latitude: undefined,
      longitude: undefined,
      radiusKm: undefined,
      minRating: undefined,
      maxPrice: undefined,
    });
  };

  return (
    <aside className="bg-superficie rounded-lg shadow-card p-5 space-y-5">
      <h2 className="font-semibold text-principal">{tResultados('filtros')}</h2>

      <div>
        <label
          htmlFor="filtro-categoria"
          className="block text-sm font-medium text-secundario mb-1"
        >
          {t('categoria')}
        </label>
        <select
          id="filtro-categoria"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-acento"
        >
          <option value="">{t('todasCategorias')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {nombreCategoria(c)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="filtro-ciudad"
          className="block text-sm font-medium text-secundario mb-1"
        >
          {t('ciudad')}
        </label>
        <select
          id="filtro-ciudad"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal focus:outline-none focus:ring-2 focus:ring-acento"
        >
          <option value="">{t('todasCiudades')}</option>
          {CIUDADES.map((ciudad) => (
            <option key={ciudad} value={ciudad}>
              {ciudad}
            </option>
          ))}
        </select>
      </div>

      <div>
        {punto ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-secundario">
                {t('cercaDeTi')}
              </p>
              <button
                type="button"
                onClick={() => setPunto(null)}
                className="text-sm text-acento underline hover:no-underline"
              >
                {t('quitarUbicacion')}
              </button>
            </div>
            <label
              htmlFor="filtro-radio"
              className="mt-2 block text-sm font-medium text-secundario mb-1"
            >
              {t('radio', { km: radiusKm })}
            </label>
            <input
              id="filtro-radio"
              type="range"
              min={1}
              max={50}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={localizar}
            disabled={ubicacion === 'buscando'}
          >
            <LocateFixed size={16} aria-hidden="true" className="me-2" />
            {ubicacion === 'buscando' ? t('localizando') : t('usarUbicacion')}
          </Button>
        )}
        {ubicacion === 'fallida' ? (
          <p role="alert" className="mt-2 text-sm text-error">
            {t('sinUbicacion')}
          </p>
        ) : (
          <p className="mt-2 text-xs text-tenue">{t('ubicacionAyuda')}</p>
        )}
      </div>

      <div>
        <p
          id="filtro-valoracion"
          className="block text-sm font-medium text-secundario mb-2"
        >
          {t('valoracionMinima')}
        </p>
        <RatingStars
          rating={minRating}
          interactive
          onChange={setMinRating}
          idEtiqueta="filtro-valoracion"
          ninguna={t('valoracionCualquiera')}
        />
      </div>

      <div>
        <label
          htmlFor="filtro-precio-maximo"
          className="block text-sm font-medium text-secundario mb-1"
        >
          {t('precioMaximo')}
        </label>
        <input
          id="filtro-precio-maximo"
          type="number"
          min={0}
          value={maxPrice || ''}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          placeholder={t('sinLimite')}
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-acento"
        />
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <Button onClick={handleApply} fullWidth>
          {t('aplicar')}
        </Button>
        <Button onClick={handleReset} variant="ghost" fullWidth>
          {t('limpiar')}
        </Button>
      </div>
    </aside>
  );
}
