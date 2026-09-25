import type { Point } from 'typeorm';

/**
 * Un punto en el formato en que TypeORM escribe las columnas de PostGIS.
 *
 * TypeORM convierte lo que recibe una columna geométrica con
 * ST_GeomFromGeoJSON, así que tiene que ser GeoJSON. El perfil de usuario le
 * pasaba texto, `SRID=4326;POINT(...)`, y la consulta fallaba entera: guardar
 * la ubicación daba un 500. Los servicios esquivaban la conversión con una
 * función que devolvía SQL con las coordenadas dentro, que funciona pero deja
 * la seguridad de la consulta en manos de la validación del DTO.
 *
 * El orden es el de GeoJSON, longitud y después latitud. El SRID lo pone la
 * columna, que lo declara.
 */
export function puntoGeografico(latitud: number, longitud: number): Point {
  return { type: 'Point', coordinates: [longitud, latitud] };
}
