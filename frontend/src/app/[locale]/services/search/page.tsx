import AsistenteBusqueda from '@/components/organisms/AsistenteBusqueda';
import {
  filtrosDeUrl,
  paginaDeUrl,
  peticionDeBusqueda,
  urlDeBusqueda,
  vistaDeUrl,
} from '@/lib/busqueda';
import { buscarEnServidor } from '@/lib/busqueda-servidor';
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
