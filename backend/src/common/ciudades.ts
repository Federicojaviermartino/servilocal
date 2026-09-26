import { normalizar as sinAcentos } from '../services/sinonimos';

/**
 * Las ciudades con cobertura y el punto que representa a cada una.
 *
 * El formulario de alta del frontend ofrece estas mismas ciudades, y la API
 * exigía latitud y longitud que el formulario nunca enviaba: publicar un
 * servicio desde la aplicación daba siempre un 400. Ahora, si no llegan
 * coordenadas, el servicio se sitúa en su ciudad. La semilla usa la misma
 * tabla, para que lo sembrado y lo publicado estén en el mismo sitio.
 */
export const COORDENADAS_CIUDAD: Readonly<
  Record<string, { lat: number; lng: number }>
> = {
  Madrid: { lat: 40.4168, lng: -3.7038 },
  Barcelona: { lat: 41.3874, lng: 2.1686 },
  Valencia: { lat: 39.4699, lng: -0.3763 },
  Sevilla: { lat: 37.3891, lng: -5.9845 },
  Zaragoza: { lat: 41.6488, lng: -0.8891 },
  Málaga: { lat: 36.7213, lng: -4.4214 },
  Bilbao: { lat: 43.263, lng: -2.935 },
  Murcia: { lat: 37.9922, lng: -1.1307 },
  Palma: { lat: 39.5696, lng: 2.6502 },
  'Las Palmas de Gran Canaria': { lat: 28.1235, lng: -15.4363 },
};

/** Como compara la búsqueda: sin mayúsculas ni acentos, y sin espacios de sobra. */
const normalizar = (texto: string) => sinAcentos(texto.trim());

const POR_NOMBRE = new Map(
  Object.entries(COORDENADAS_CIUDAD).map(([nombre, punto]) => [
    normalizar(nombre),
    punto,
  ]),
);

/**
 * El punto de una ciudad, o null si no está entre las que tienen cobertura.
 * «Malaga» y «MÁLAGA» valen como «Málaga»: los servicios antiguos se
 * guardaron así.
 */
export function coordenadasDeCiudad(
  ciudad: string | undefined | null,
): { lat: number; lng: number } | null {
  if (!ciudad) return null;
  return POR_NOMBRE.get(normalizar(ciudad)) ?? null;
}

export const mismaCiudad = (a: string, b: string) =>
  normalizar(a) === normalizar(b);
