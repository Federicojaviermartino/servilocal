import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import AsistenteBusqueda from '@/components/organisms/AsistenteBusqueda';
import {
  filtrosDeUrl,
  paginaDeUrl,
  peticionDeBusqueda,
  urlDeBusqueda,
  vistaDeUrl,
} from '@/lib/busqueda';
import { buscarEnServidor } from '@/lib/busqueda-servidor';
import { alternativas, grafoAbierto } from '@/lib/seo';
import Buscador from './buscador';

type Recibidos = Record<string, string | string[] | undefined>;

/** Lo que trae la dirección, con el primer valor de cada parámetro. */
function parametrosDe(recibidos: Recibidos): URLSearchParams {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(recibidos)) {
    const primero = Array.isArray(valor) ? valor[0] : valor;
    if (primero !== undefined) parametros.set(clave, primero);
  }
  return parametros;
}

/** Lo que cabe en la pestaña sin comerse el nombre de la página. */
const LARGO_EN_EL_TITULO = 60;

/**
 * Los metadatos del buscador, con lo que se busca en el título.
 *
 * Aquí y no en un layout, que no recibe los parámetros de la dirección. El
 * título era siempre el mismo, «Buscar servicios»: quien tiene tres
 * búsquedas abiertas no distinguía las pestañas, y al cambiar de búsqueda
 * Next no anunciaba nada a un lector de pantalla, porque solo habla cuando
 * el título cambia. Generados, y no una constante, porque una constante no
 * sabe en qué idioma se sirve.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Recibidos>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const { query, city } = filtrosDeUrl(parametrosDe(await searchParams));
  const buscado = [query, city]
    .filter((parte): parte is string => Boolean(parte))
    .map((parte) => parte.slice(0, LARGO_EN_EL_TITULO));

  return {
    title: [...buscado, t('buscadorTitulo')].join(' · '),
    description: t('buscadorDescripcion'),
    alternates: alternativas(locale, '/services/search'),
    openGraph: grafoAbierto(locale, {
      titulo: t('buscadorTitulo'),
      descripcion: t('buscadorDescripcion'),
      ruta: '/services/search',
    }),
  };
}

/**
 * El buscador se sirve desde aquí: se lee la dirección y se piden los
 * resultados, sin esperarlos. La página sale en cuanto está, con el título,
 * la barra de búsqueda y los filtros, y los resultados llegan después por
 * streaming. Cada búsqueda que llega por la URL —un enlace, el botón de
 * atrás, un filtro nuevo— es otra página y empieza de cero.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Recibidos>;
}) {
  const parametros = parametrosDe(await searchParams);
  const filtros = filtrosDeUrl(parametros);
  const vista = vistaDeUrl(parametros);
  const pagina = vista === 'map' ? 1 : paginaDeUrl(parametros);
  // En la forma en que la escribe la página: dos direcciones con los mismos
  // filtros en otro orden son la misma búsqueda.
  const claveUrl = urlDeBusqueda(filtros, vista, pagina);

  return (
    <>
      <Buscador
        key={claveUrl}
        claveUrl={claveUrl}
        filtros={filtros}
        vista={vista}
        pagina={pagina}
        primera={buscarEnServidor(peticionDeBusqueda(filtros, vista, pagina))}
      />
      <AsistenteBusqueda />
    </>
  );
}
