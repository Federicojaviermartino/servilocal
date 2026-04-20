'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Service, ServiceSearchParams } from '@/types';
import { servicesApi } from '@/lib/api';
import SearchBar from '@/components/molecules/SearchBar';
import FilterPanel from '@/components/organisms/FilterPanel';
import ResultsList from '@/components/organisms/ResultsList';

export const dynamic = 'force-dynamic';

// Carga dinamica del mapa para evitar SSR issues con Leaflet
const ServiceMap = dynamic(
  () => import('@/components/organisms/ServiceMap'),
  { ssr: false, loading: () => <div className="h-[500px] bg-neutral-100 rounded-lg animate-pulse" /> },
);

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<ServiceSearchParams>({});

  const fetchResults = useCallback(async (params: ServiceSearchParams) => {
    setIsLoading(true);
    try {
      const { data } = await servicesApi.search(params);
      // Soporta respuesta paginada o array directo
      if (Array.isArray(data)) {
        setServices(data);
        setTotal(data.length);
      } else {
        setServices(data.data || []);
        setTotal(data.total || 0);
      }
    } catch {
      setServices([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial: ServiceSearchParams = {
      query: searchParams.get('q') || undefined,
      categoryId: searchParams.get('category') || undefined,
      city: searchParams.get('city') || undefined,
    };
    setFilters(initial);
    fetchResults(initial);
  }, [searchParams, fetchResults]);

  const handleSearch = (query: string) => {
    const next = { ...filters, query: query || undefined };
    setFilters(next);
    fetchResults(next);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    router.replace(`/services/search?${params.toString()}`);
  };

  const handleApplyFilters = (newFilters: ServiceSearchParams) => {
    const merged = { ...filters, ...newFilters };
    setFilters(merged);
    fetchResults(merged);
  };

  return (
    <main className="bg-neutral-50 min-h-screen">
      <div className="bg-white border-b border-neutral-200 py-4 px-4">
        <div className="max-w-6xl mx-auto">
          <SearchBar
            initialValue={filters.query}
            onSearch={handleSearch}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <FilterPanel initial={filters} onApply={handleApplyFilters} />
          </div>

          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-semibold text-neutral-900">
                Resultados de la busqueda
              </h1>
              <div className="flex bg-white rounded-md shadow-card">
                <button
                  onClick={() => setView('list')}
                  className={`px-4 py-2 text-sm rounded-l-md ${
                    view === 'list'
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Lista
                </button>
                <button
                  onClick={() => setView('map')}
                  className={`px-4 py-2 text-sm rounded-r-md ${
                    view === 'map'
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Mapa
                </button>
              </div>
            </div>

            {view === 'list' ? (
              <ResultsList
                services={services}
                isLoading={isLoading}
                total={total}
              />
            ) : (
              <ServiceMap services={services} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
