'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useSearchParams, useRouter } from 'next/navigation';
import nextDynamic from 'next/dynamic';
import { Service, ServiceSearchParams } from '@/types';
import { servicesApi } from '@/lib/api';
import SearchBar from '@/components/molecules/SearchBar';
import FilterPanel from '@/components/organisms/FilterPanel';
import ResultsList from '@/components/organisms/ResultsList';
import Pagination from '@/components/molecules/Pagination';
import ServiceCardSkeleton from '@/components/molecules/ServiceCardSkeleton';

type Vista = 'list' | 'map';

// Una lista se pagina; un mapa, no: quien lo abre espera ver todos los
// resultados del área, no doce de veinticinco. 50 es el máximo que admite la API.
const LIMITE_MAPA = 50;

// Carga dinamica del mapa para evitar SSR issues con Leaflet
const ServiceMap = nextDynamic(
  () => import('@/components/organisms/ServiceMap'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] bg-neutral-100 rounded-lg animate-pulse" />
    ),
  },
);

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<Vista>('list');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [filters, setFilters] = useState<ServiceSearchParams>({});
  const [page, setPage] = useState(1);
  const [tardando, setTardando] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [fetchError, setFetchError] = useState<
    'network' | 'timeout' | 'unavailable' | null
  >(null);

  // Puede haber varias búsquedas en vuelo a la vez (cambiar de vista mientras
  // carga la inicial, por ejemplo). Sin este contador gana la que responde la
  // última, no la que se pidió la última, y la lista acaba mostrando datos de
  // una petición ya descartada.
  const peticionVigente = useRef(0);

  const fetchResults = useCallback(
    async (
      params: ServiceSearchParams,
      paginaSolicitada: number,
      vista: Vista,
    ) => {
      const idPeticion = ++peticionVigente.current;
      setIsLoading(true);
      setFetchError(null);
      try {
        const { data } = await servicesApi.search({
          ...params,
          page: paginaSolicitada,
          ...(vista === 'map' ? { limit: LIMITE_MAPA } : {}),
        });
        if (idPeticion !== peticionVigente.current) return;
        // Soporta respuesta paginada { data, meta } o array directo
        if (Array.isArray(data)) {
          setServices(data);
          setTotal(data.length);
          setTotalPages(1);
        } else {
          const items = data.data || [];
          setServices(items);
          setTotal(data.meta?.total ?? data.total ?? items.length);
          setTotalPages(data.meta?.totalPages ?? 1);
        }
        setPage(paginaSolicitada);
      } catch (err: any) {
        if (idPeticion !== peticionVigente.current) return;
        setServices([]);
        setTotal(0);
        setTotalPages(1);
        if (err?.code === 'ECONNABORTED') setFetchError('timeout');
        else if (!err?.response) setFetchError('network');
        else setFetchError('unavailable');
      } finally {
        if (idPeticion === peticionVigente.current) setIsLoading(false);
      }
    },
    [],
  );

  // Si la espera se alarga suele ser la instancia gratuita despertando. Vale
  // más explicarlo que dejar al usuario mirando un indicador de carga mudo.
  useEffect(() => {
    if (!isLoading) {
      setTardando(false);
      return;
    }
    const temporizador = setTimeout(() => setTardando(true), 6000);
    return () => clearTimeout(temporizador);
  }, [isLoading]);

  useEffect(() => {
    const initial: ServiceSearchParams = {
      query: searchParams.get('q') || undefined,
      categoryId: searchParams.get('category') || undefined,
      city: searchParams.get('city') || undefined,
    };
    setFilters(initial);
    fetchResults(initial, 1, 'list');
  }, [searchParams, fetchResults]);

  const handleSearch = (query: string) => {
    const next = { ...filters, query: query || undefined };
    setFilters(next);
    fetchResults(next, 1, view);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    router.replace(`/services/search?${params.toString()}`);
  };

  const cambiarVista = (nueva: Vista) => {
    if (nueva === view) return;
    setView(nueva);
    fetchResults(filters, 1, nueva);
  };

  const cambiarPagina = (nuevaPagina: number) => {
    fetchResults(filters, nuevaPagina, view);
    // Al saltar de página el usuario espera empezar por el primer resultado.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleApplyFilters = (newFilters: ServiceSearchParams) => {
    const merged = { ...filters, ...newFilters };
    setFilters(merged);
    fetchResults(merged, 1, view);
  };

  return (
    <main className="bg-neutral-50 min-h-screen">
      <div className="bg-white border-b border-neutral-200 py-4 px-4">
        <div className="max-w-6xl mx-auto">
          <SearchBar initialValue={filters.query} onSearch={handleSearch} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            {/* En móvil el panel desplegado empujaba los resultados fuera de
                la primera pantalla, así que se pliega tras un botón. En
                escritorio sigue siempre visible. */}
            <button
              type="button"
              onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
              aria-expanded={filtrosAbiertos}
              aria-controls="panel-filtros"
              className="mb-3 flex w-full items-center justify-between rounded-lg bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-card lg:hidden"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal size={18} aria-hidden="true" />
                Filtros
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={clsx(
                  'transition-transform',
                  filtrosAbiertos && 'rotate-180',
                )}
              />
            </button>
            <div
              id="panel-filtros"
              className={clsx(filtrosAbiertos ? 'block' : 'hidden', 'lg:block')}
            >
              <FilterPanel initial={filters} onApply={handleApplyFilters} />
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-semibold text-neutral-900">
                Resultados de la búsqueda
              </h1>
              <div className="flex bg-white rounded-md shadow-card">
                <button
                  onClick={() => cambiarVista('list')}
                  className={`px-4 py-2 text-sm rounded-l-md ${
                    view === 'list'
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Lista
                </button>
                <button
                  onClick={() => cambiarVista('map')}
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

            {isLoading ? (
              <div>
                {tardando && (
                  <p className="mb-4 rounded-lg bg-neutral-100 p-3 text-center text-sm text-neutral-600">
                    El servidor está despertando tras un periodo de inactividad.
                    Puede tardar hasta un minuto.
                  </p>
                )}
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  role="status"
                  aria-label="Cargando resultados"
                >
                  {Array.from({ length: 6 }).map((_, indice) => (
                    <ServiceCardSkeleton key={indice} />
                  ))}
                </div>
              </div>
            ) : fetchError ? (
              <div
                className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800"
                role="alert"
              >
                <p>
                  {fetchError === 'timeout'
                    ? 'El servidor ha tardado demasiado en responder. Puede estar reactivándose tras un periodo de inactividad.'
                    : fetchError === 'network'
                      ? 'No se pudo contactar con el servidor. Inténtalo de nuevo en unos segundos.'
                      : 'Servicio no disponible. Inténtalo de nuevo más tarde.'}
                </p>
                <button
                  type="button"
                  onClick={() => fetchResults(filters, page, view)}
                  className="mt-2 font-medium underline hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            ) : view === 'list' ? (
              <ResultsList services={services} total={total} />
            ) : (
              <ServiceMap services={services} />
            )}

            {!isLoading && !fetchError && view === 'list' && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={cambiarPagina}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="bg-neutral-50 min-h-screen" />}>
      <SearchPageContent />
    </Suspense>
  );
}
