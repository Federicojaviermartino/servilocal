'use client';
import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import nextDynamic from 'next/dynamic';
import type { ServiceSearchParams } from '@/types';
import { servicesApi } from '@/lib/api';
import {
  leerBusqueda,
  peticionDeBusqueda,
  urlDeBusqueda,
  type ResultadoBusqueda,
  type Vista,
} from '@/lib/busqueda';
import SearchBar from '@/components/molecules/SearchBar';
import FilterPanel from '@/components/organisms/FilterPanel';
import ResultsList from '@/components/organisms/ResultsList';
import Pagination from '@/components/molecules/Pagination';
import ServiceCardSkeleton from '@/components/molecules/ServiceCardSkeleton';
import { desplazamiento } from '@/lib/movimiento';

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

/** Lo que hay en pantalla, y a qué intento responde. */
interface Estado {
  intento: number;
  datos: ResultadoBusqueda | null;
  fallo: FalloBusqueda | null;
}

/**
 * Tras cambiar de página, el título de la búsqueda nueva se lleva el foco.
 * La búsqueda nueva es otro componente, montado al cambiar la dirección, así
 * que el aviso no puede ir en su estado.
 */
let enfocarAlMontar = false;

interface BuscadorProps {
  /** La búsqueda en la forma en que la escribe la página. */
  claveUrl: string;
  filtros: ServiceSearchParams;
  vista: Vista;
  pagina: number;
  /** La primera respuesta, pedida desde el servidor; null si no contestó. */
  primera: Promise<ResultadoBusqueda | null>;
}

/**
 * El buscador: la dirección manda.
 *
 * Los filtros, la vista y la página se leen de la URL en el servidor, que
 * pide ya los resultados; cambiar cualquiera de ellos es cambiar la
 * dirección, y la página vuelve a servirse con la búsqueda nueva. Aquí solo
 * se busca desde el navegador si el servidor no obtuvo respuesta o si se
 * reintenta.
 */
export default function Buscador({
  claveUrl,
  filtros,
  vista,
  pagina,
  primera,
}: BuscadorProps) {
  const t = useTranslations('resultados');
  const router = useRouter();
  const titulo = useRef<HTMLHeadingElement>(null);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // Pedir lo mismo otra vez: repetir la búsqueda o cambiar a la vista que
  // ya está no cambia la dirección.
  const [repeticion, setRepeticion] = useState(0);

  useEffect(() => {
    if (!enfocarAlMontar) return;
    enfocarAlMontar = false;
    titulo.current?.focus({ preventScroll: true });
  }, []);

  const irA = (destino: string, modo: 'replace' | 'push' = 'replace') => {
    const ruta = destino ? `/services/search?${destino}` : '/services/search';
    if (modo === 'push') router.push(ruta, { scroll: false });
    else router.replace(ruta);
  };

  /** Una búsqueda nueva, desde la primera página. */
  const buscar = (nuevos: ServiceSearchParams) => {
    const destino = urlDeBusqueda(nuevos, vista);
    if (destino !== claveUrl) {
      irA(destino);
      return;
    }
    // La misma dirección: se vuelve a pedir lo mismo desde la primera
    // página.
    if (pagina > 1) irA(destino);
    else setRepeticion((r) => r + 1);
  };

  const handleSearch = (query: string) =>
    buscar({ ...filtros, query: query || undefined });

  const handleApplyFilters = (nuevos: ServiceSearchParams) =>
    buscar({ ...filtros, ...nuevos });

  const cambiarVista = (nueva: Vista) => {
    if (nueva === vista) return;
    irA(urlDeBusqueda(filtros, nueva));
  };

  const cambiarPagina = (nuevaPagina: number) => {
    // Al saltar de página se espera empezar por el primer resultado, sin
    // animación si se ha pedido menos movimiento, y con el foco en el
    // título: con teclado o lector de pantalla se quedaba en la paginación,
    // al pie, sin enterarse de que la lista había cambiado. Cada página es
    // una entrada del historial, y atrás vuelve a la anterior.
    window.scrollTo({ top: 0, behavior: desplazamiento() });
    enfocarAlMontar = true;
    irA(urlDeBusqueda(filtros, vista, nuevaPagina), 'push');
  };

  return (
    <div className="bg-fondo min-h-screen">
      <div className="bg-superficie border-b border-borde py-4 px-4">
        <div className="max-w-6xl mx-auto">
          <SearchBar initialValue={filtros.query} onSearch={handleSearch} />
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
              <FilterPanel initial={filtros} onApply={handleApplyFilters} />
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
                  aria-pressed={vista === 'list'}
                  onClick={() => cambiarVista('list')}
                  className={`px-4 py-2 text-sm rounded-s-md ${
                    vista === 'list'
                      ? 'bg-primary-600 text-white'
                      : 'text-secundario hover:bg-fondo'
                  }`}
                >
                  {t('vistaLista')}
                </button>
                <button
                  type="button"
                  aria-pressed={vista === 'map'}
                  onClick={() => cambiarVista('map')}
                  className={`px-4 py-2 text-sm rounded-e-md ${
                    vista === 'map'
                      ? 'bg-primary-600 text-white'
                      : 'text-secundario hover:bg-fondo'
                  }`}
                >
                  {t('vistaMapa')}
                </button>
              </div>
            </div>

            <Suspense fallback={<Esperando />}>
              <Resultados
                key={repeticion}
                primera={repeticion === 0 ? primera : null}
                filtros={filtros}
                vista={vista}
                pagina={pagina}
                onPagina={cambiarPagina}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mientras llegan los resultados. Si la espera se alarga suele ser la
 * instancia gratuita despertando, y vale más explicarlo que dejar al usuario
 * mirando un indicador de carga mudo.
 */
function Esperando() {
  const t = useTranslations('resultados');
  const [tardando, setTardando] = useState(false);

  useEffect(() => {
    const temporizador = setTimeout(() => setTardando(true), 6000);
    return () => clearTimeout(temporizador);
  }, []);

  return (
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
  );
}

function Resultados({
  primera,
  filtros,
  vista,
  pagina,
  onPagina,
}: {
  primera: Promise<ResultadoBusqueda | null> | null;
  filtros: ServiceSearchParams;
  vista: Vista;
  pagina: number;
  onPagina: (pagina: number) => void;
}) {
  const t = useTranslations('resultados');
  const tComun = useTranslations('comun');
  const delServidor = primera ? use(primera) : null;
  const [intento, setIntento] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(() =>
    delServidor ? { intento: 0, datos: delServidor, fallo: null } : null,
  );

  // Los props no cambian mientras este componente vive: otra búsqueda es
  // otra dirección, y otro componente.
  const peticion = useMemo(
    () => peticionDeBusqueda(filtros, vista, pagina),
    [filtros, vista, pagina],
  );
  const pendiente = estado?.intento !== intento;

  useEffect(() => {
    if (!pendiente) return;
    let vigente = true;
    servicesApi
      .search(peticion)
      .then(({ data }) => {
        if (vigente)
          setEstado({ intento, datos: leerBusqueda(data), fallo: null });
      })
      .catch((error: { code?: string; response?: unknown }) => {
        if (!vigente) return;
        setEstado({
          intento,
          datos: null,
          fallo:
            error?.code === 'ECONNABORTED'
              ? 'timeout'
              : !error?.response
                ? 'network'
                : 'unavailable',
        });
      });
    return () => {
      vigente = false;
    };
  }, [pendiente, intento, peticion]);

  if (pendiente || !estado) return <Esperando />;

  if (estado.fallo) {
    return (
      <div
        className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800"
        role="alert"
      >
        <p>
          {estado.fallo === 'timeout'
            ? t('errorTimeout')
            : estado.fallo === 'network'
              ? t('errorRed')
              : t('errorServicio')}
        </p>
        <button
          type="button"
          onClick={() => setIntento((i) => i + 1)}
          className="mt-2 font-medium underline hover:no-underline"
        >
          {tComun('reintentar')}
        </button>
      </div>
    );
  }

  const datos = estado.datos as ResultadoBusqueda;
  if (vista === 'map') return <ServiceMap services={datos.services} />;

  return (
    <>
      <ResultsList
        services={datos.services}
        total={datos.total}
        totalEsParcial={datos.totalEsParcial}
      />
      <Pagination
        page={pagina}
        totalPages={datos.totalPages}
        onChange={onPagina}
      />
    </>
  );
}
