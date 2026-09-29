'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import nextDynamic from 'next/dynamic';
import { Service, ServiceSearchParams } from '@/types';
import { servicesApi } from '@/lib/api';
import SearchBar from '@/components/molecules/SearchBar';
import FilterPanel from '@/components/organisms/FilterPanel';
import ResultsList from '@/components/organisms/ResultsList';
import Pagination from '@/components/molecules/Pagination';
import ServiceCardSkeleton from '@/components/molecules/ServiceCardSkeleton';
import AsistenteBusqueda from '@/components/organisms/AsistenteBusqueda';
import { desplazamiento } from '@/lib/movimiento';

type Vista = 'list' | 'map';

// Una lista se pagina; un mapa, no: quien lo abre espera ver todos los
// resultados del área, no doce de veinticinco. 50 es el máximo que admite la API.
const LIMITE_MAPA = 50;

// El mapa se carga aparte y solo en el navegador: Leaflet necesita window.
const ServiceMap = nextDynamic(
  () => import('@/components/organisms/ServiceMap'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] bg-superficie-alt rounded-lg animate-pulse" />
    ),
  },
);

type FalloBusqueda = 'network' | 'timeout' | 'unavailable';

/** Lo que se ha pedido. Cada cambio es un objeto nuevo, y eso lanza la petición. */
interface Consulta {
  filtros: ServiceSearchParams;
  pagina: number;
  vista: Vista;
  /** Sube al reintentar, para volver a pedir lo mismo. */
  intento: number;
}

/** Lo que ha llegado, y a qué consulta responde. */
interface Resultado {
  consulta: Consulta;
  services: Service[];
  total: number;
  totalEsParcial: boolean;
  totalPages: number;
  fallo: FalloBusqueda | null;
}

/**
 * Los filtros y la vista viven en la dirección.
 *
 * Solo iban el texto, la categoría y la ciudad, y solo al llegar: los del
 * panel no se escribían nunca, así que buscar un texto nuevo, volver atrás o
 * recargar los perdía, y un enlace no llevaba los filtros que se veían.
 */
function filtrosDeUrl(
  parametros: ReadonlyURLSearchParams,
): ServiceSearchParams {
  const numero = (clave: string) => {
    const valor = Number(parametros.get(clave));
    return Number.isFinite(valor) && valor > 0 ? valor : undefined;
  };
  return {
    query: parametros.get('q') || undefined,
    categoryId: parametros.get('category') || undefined,
    city: parametros.get('city') || undefined,
    radiusKm: numero('radius'),
    minRating: numero('rating'),
    maxPrice: numero('maxPrice'),
  };
}

function vistaDeUrl(parametros: ReadonlyURLSearchParams): Vista {
  return parametros.get('view') === 'map' ? 'map' : 'list';
}

/** La dirección de unos filtros y una vista, siempre en el mismo orden. */
function urlDeBusqueda(filtros: ServiceSearchParams, vista: Vista): string {
  const parametros = new URLSearchParams();
  if (filtros.query) parametros.set('q', filtros.query);
  if (filtros.categoryId) parametros.set('category', filtros.categoryId);
  if (filtros.city) parametros.set('city', filtros.city);
  if (filtros.radiusKm) parametros.set('radius', String(filtros.radiusKm));
  if (filtros.minRating) parametros.set('rating', String(filtros.minRating));
  if (filtros.maxPrice) parametros.set('maxPrice', String(filtros.maxPrice));
  if (vista === 'map') parametros.set('view', 'map');
  return parametros.toString();
}

function SearchPageContent({
  inicial,
  vistaInicial,
  claveUrl,
}: {
  inicial: ServiceSearchParams;
  vistaInicial: Vista;
  claveUrl: string;
}) {
  const t = useTranslations('resultados');
  const titulo = useRef<HTMLHeadingElement>(null);
  const tComun = useTranslations('comun');
  const router = useRouter();
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [consulta, setConsulta] = useState<Consulta>(() => ({
    filtros: inicial,
    pagina: 1,
    vista: vistaInicial,
    intento: 0,
  }));
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [tardandoEn, setTardandoEn] = useState<Consulta | null>(null);

  // Puede haber varias búsquedas en vuelo a la vez (cambiar de vista
  // mientras carga la inicial, por ejemplo). Solo se acepta la respuesta de
  // la consulta vigente: sin eso gana la que responde la última, no la que
  // se pidió la última, y la lista muestra datos de una petición descartada.
  useEffect(() => {
    let vigente = true;

    servicesApi
      .search({
        ...consulta.filtros,
        page: consulta.pagina,
        ...(consulta.vista === 'map' ? { limit: LIMITE_MAPA } : {}),
      })
      .then(({ data }) => {
        if (!vigente) return;
        // Soporta respuesta paginada { data, meta } o array directo
        const items: Service[] = Array.isArray(data) ? data : data.data || [];
        setResultado({
          consulta,
          services: items,
          total: Array.isArray(data)
            ? data.length
            : (data.meta?.total ?? data.total ?? items.length),
          totalEsParcial:
            !Array.isArray(data) && Boolean(data.meta?.totalEsParcial),
          totalPages: Array.isArray(data) ? 1 : (data.meta?.totalPages ?? 1),
          fallo: null,
        });
      })
      .catch((err: any) => {
        if (!vigente) return;
        setResultado({
          consulta,
          services: [],
          total: 0,
          totalEsParcial: false,
          totalPages: 1,
          fallo:
            err?.code === 'ECONNABORTED'
              ? 'timeout'
              : !err?.response
                ? 'network'
                : 'unavailable',
        });
      });

    return () => {
      vigente = false;
    };
  }, [consulta]);

  // «Cargando» no se guarda: es que lo que hay en pantalla no responde a lo
  // último que se ha pedido.
  const isLoading = resultado?.consulta !== consulta;
  const view = consulta.vista;
  const filters = consulta.filtros;
  const services = resultado?.services ?? [];
  const fetchError = resultado?.fallo ?? null;

  // Si la espera se alarga suele ser la instancia gratuita despertando. Vale
  // más explicarlo que dejar al usuario mirando un indicador de carga mudo.
  // Se marca qué consulta tarda, así el aviso desaparece solo al cambiar.
  useEffect(() => {
    if (!isLoading) return;
    const temporizador = setTimeout(() => setTardandoEn(consulta), 6000);
    return () => clearTimeout(temporizador);
  }, [isLoading, consulta]);
  const tardando = isLoading && tardandoEn === consulta;

  // La URL manda: los filtros y la vista se escriben en ella, y al cambiar
  // la página vuelve a empezar desde ahí (ver BusquedaDesdeUrl). Si no
  // cambia, se vuelve a pedir lo mismo desde la primera página.
  const irA = (destino: string) =>
    router.replace(
      destino ? `/services/search?${destino}` : '/services/search',
    );

  const handleSearch = (query: string) => {
    const destino = urlDeBusqueda(
      { ...consulta.filtros, query: query || undefined },
      consulta.vista,
    );
    if (destino !== claveUrl) {
      irA(destino);
      return;
    }
    setConsulta((c) => ({ ...c, pagina: 1, intento: c.intento + 1 }));
  };

  const cambiarVista = (nueva: Vista) => {
    if (nueva === view) return;
    irA(urlDeBusqueda(consulta.filtros, nueva));
  };

  const cambiarPagina = (nuevaPagina: number) => {
    setConsulta((c) => ({ ...c, pagina: nuevaPagina }));
    // Al saltar de página el usuario espera empezar por el primer resultado.
    // Sin animación si ha pedido menos movimiento, y con el foco en el
    // título: con teclado o lector de pantalla se quedaba en el botón de la
    // paginación, al pie, sin enterarse de que la lista había cambiado.
    window.scrollTo({ top: 0, behavior: desplazamiento() });
    titulo.current?.focus({ preventScroll: true });
  };

  const handleApplyFilters = (newFilters: ServiceSearchParams) => {
    const destino = urlDeBusqueda(
      { ...consulta.filtros, ...newFilters },
      consulta.vista,
    );
    if (destino !== claveUrl) {
      irA(destino);
      return;
    }
    setConsulta((c) => ({ ...c, pagina: 1, intento: c.intento + 1 }));
  };

  const reintentar = () =>
    setConsulta((c) => ({ ...c, intento: c.intento + 1 }));

  return (
    <div className="bg-fondo min-h-screen">
      <div className="bg-superficie border-b border-borde py-4 px-4">
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
              className="mb-3 flex w-full items-center justify-between rounded-lg bg-superficie px-4 py-3 text-sm font-medium text-principal shadow-card lg:hidden"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal size={18} aria-hidden="true" />
                {t('filtros')}
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
              <h1
                ref={titulo}
                tabIndex={-1}
                className="text-xl font-semibold text-principal focus:outline-none"
              >
                {t('titulo')}
              </h1>
              {/* aria-pressed: la vista activa solo se distinguía por el
                  color. Esquinas lógicas, que en árabe van al revés. */}
              <div className="flex bg-superficie rounded-md shadow-card">
                <button
                  type="button"
                  aria-pressed={view === 'list'}
                  onClick={() => cambiarVista('list')}
                  className={`px-4 py-2 text-sm rounded-s-md ${
                    view === 'list'
                      ? 'bg-primary-600 text-white'
                      : 'text-secundario hover:bg-fondo'
                  }`}
                >
                  {t('vistaLista')}
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'map'}
                  onClick={() => cambiarVista('map')}
                  className={`px-4 py-2 text-sm rounded-e-md ${
                    view === 'map'
                      ? 'bg-primary-600 text-white'
                      : 'text-secundario hover:bg-fondo'
                  }`}
                >
                  {t('vistaMapa')}
                </button>
              </div>
            </div>

            {isLoading ? (
              <div>
                {tardando && (
                  <p className="mb-4 rounded-lg bg-superficie-alt p-3 text-center text-sm text-secundario">
                    {t('despertando')}
                  </p>
                )}
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  role="status"
                  aria-label={t('cargando')}
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
                    ? t('errorTimeout')
                    : fetchError === 'network'
                      ? t('errorRed')
                      : t('errorServicio')}
                </p>
                <button
                  type="button"
                  onClick={reintentar}
                  className="mt-2 font-medium underline hover:no-underline"
                >
                  {tComun('reintentar')}
                </button>
              </div>
            ) : view === 'list' ? (
              <ResultsList
                services={services}
                total={resultado?.total ?? 0}
                totalEsParcial={resultado?.totalEsParcial ?? false}
              />
            ) : (
              <ServiceMap services={services} />
            )}

            {!isLoading && !fetchError && view === 'list' && (
              <Pagination
                page={consulta.pagina}
                totalPages={resultado?.totalPages ?? 1}
                onChange={cambiarPagina}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Cada búsqueda que llega por la URL —un enlace, el botón de atrás, el
 * asistente— empieza de cero con los filtros que trae. Antes un efecto los
 * copiaba al estado y relanzaba la búsqueda cada vez que la URL cambiaba.
 */
function BusquedaDesdeUrl() {
  const searchParams = useSearchParams();
  const inicial = filtrosDeUrl(searchParams);
  const vistaInicial = vistaDeUrl(searchParams);
  // En la forma en que la escribe la página: dos direcciones con los mismos
  // filtros en otro orden son la misma búsqueda.
  const claveUrl = urlDeBusqueda(inicial, vistaInicial);
  return (
    <SearchPageContent
      key={claveUrl}
      claveUrl={claveUrl}
      inicial={inicial}
      vistaInicial={vistaInicial}
    />
  );
}

export default function SearchPage() {
  return (
    <>
      <Suspense fallback={<div className="bg-fondo min-h-screen" />}>
        <BusquedaDesdeUrl />
      </Suspense>
      <AsistenteBusqueda />
    </>
  );
}
