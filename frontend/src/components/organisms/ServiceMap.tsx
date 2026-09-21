/**
 * Nivel atomico: Organismo
 * Componente: ServiceMap (mapa Leaflet con marcadores de servicios)
 *
 * Se carga dinamicamente para evitar problemas de SSR con Leaflet.
 */
'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Service } from '@/types';

// Workaround para los iconos de Leaflet en bundlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface ServiceMapProps {
  services: Service[];
  center?: [number, number];
  zoom?: number;
  height?: string;
}

/**
 * Encuadra el mapa sobre lo que hay que ver.
 *
 * El centro estaba fijo en Madrid y no se movía nunca, así que buscar en
 * Barcelona abría un mapa de Madrid, sin un solo marcador a la vista y sin
 * nada que explicara por qué: nueve de las diez ciudades con cobertura caían
 * en ese caso.
 *
 * Con un único resultado no se puede encuadrar —el rectángulo tendría área
 * cero y Leaflet se iría al zoom máximo, sobre un tejado—, así que ahí se
 * centra con un acercamiento de barrio.
 */
function Encuadrar({ posiciones }: { posiciones: [number, number][] }) {
  const mapa = useMap();
  const clave = JSON.stringify(posiciones);

  useEffect(() => {
    if (posiciones.length === 0) return;
    if (posiciones.length === 1) {
      mapa.setView(posiciones[0], 14);
      return;
    }
    mapa.fitBounds(posiciones, { padding: [40, 40] });
    // La clave resume las posiciones: sin ella, el array nuevo de cada
    // render volvería a encuadrar y el mapa no se dejaría mover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, clave]);

  return null;
}

export default function ServiceMap({
  services,
  center = [40.4168, -3.7038], // Solo es el punto de partida: Encuadrar lo mueve
  zoom = 12,
  height = '500px',
}: ServiceMapProps) {
  const t = useTranslations('mapa');

  // La API entrega la posición como GeoJSON (coordinates es [lng, lat]); los
  // campos planos latitude y longitude se aceptan como alternativa por si el
  // servicio llega desde otro endpoint.
  const marcadores = services
    .map((service) => {
      const desdeGeoJson = service.location?.coordinates;
      const lat = desdeGeoJson ? desdeGeoJson[1] : service.latitude;
      const lng = desdeGeoJson ? desdeGeoJson[0] : service.longitude;
      return lat !== undefined && lng !== undefined
        ? { service, posicion: [lat, lng] as [number, number] }
        : null;
    })
    .filter(
      (m): m is { service: Service; posicion: [number, number] } => m !== null,
    );

  // Un mapa en blanco sobre una ciudad cualquiera no dice nada. Si no hay
  // nada que situar, se dice.
  if (marcadores.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-lg bg-superficie p-6 text-center text-secundario shadow-card"
      >
        {t('sinUbicaciones')}
      </div>
    );
  }

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden shadow-card">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Encuadrar posiciones={marcadores.map((m) => m.posicion)} />
        {marcadores.map(({ service, posicion }) => (
          <Marker key={service.id} position={posicion}>
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{service.title}</p>
                <p className="text-secundario">{service.city}</p>
                <p className="text-secundario">
                  {t('desde', {
                    precio: service.priceMin,
                    unidad: service.priceUnit,
                  })}
                </p>
                <Link
                  href={`/services/${service.id}`}
                  className="text-primary-600 hover:underline mt-1 inline-block"
                >
                  {t('verDetalle')}
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
