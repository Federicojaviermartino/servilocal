/**
 * Nivel atomico: Organismo
 * Componente: ServiceMap (mapa Leaflet con marcadores de servicios)
 *
 * Se carga dinamicamente para evitar problemas de SSR con Leaflet.
 */
'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
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

export default function ServiceMap({
  services,
  center = [40.4168, -3.7038], // Madrid por defecto
  zoom = 12,
  height = '500px',
}: ServiceMapProps) {
  useEffect(() => {
    // Forzar refresco de tiles tras montar
  }, []);

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
        {marcadores.map(({ service, posicion }) => (
          <Marker key={service.id} position={posicion}>
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{service.title}</p>
                <p className="text-neutral-600">{service.city}</p>
                <p className="text-neutral-600">
                  Desde {service.priceMin} {service.priceUnit}
                </p>
                <Link
                  href={`/services/${service.id}`}
                  className="text-primary-600 hover:underline mt-1 inline-block"
                >
                  Ver detalle
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
