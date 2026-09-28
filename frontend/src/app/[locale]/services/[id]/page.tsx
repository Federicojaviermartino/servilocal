import FichaServicio from './ficha';
import { obtenerServicio, obtenerValoraciones } from '@/lib/servicio-servidor';

/**
 * La ficha se sirve ya rellena: el servicio y sus valoraciones se piden
 * aquí, en el servidor, con la misma petición que usan los metadatos. Si la
 * API no contesta, la ficha lo intenta desde el navegador.
 */
export default async function ServicioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [resultado, valoraciones] = await Promise.all([
    obtenerServicio(id),
    obtenerValoraciones(id),
  ]);

  return (
    <FichaServicio
      serviceId={id}
      inicial={
        resultado.estado === 'ok' && valoraciones
          ? { servicio: resultado.servicio, valoraciones }
          : undefined
      }
    />
  );
}
