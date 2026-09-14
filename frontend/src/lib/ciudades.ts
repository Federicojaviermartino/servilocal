/**
 * Ciudades con cobertura.
 *
 * La misma lista alimenta el filtro de búsqueda y el formulario de alta, para
 * que lo que se publica y lo que se filtra coincidan siempre. El backend
 * compara ignorando mayúsculas y acentos, así que los servicios antiguos
 * guardados como "Malaga" se siguen encontrando al filtrar por "Málaga".
 */
export const CIUDADES: readonly string[] = [
  'Madrid',
  'Barcelona',
  'Valencia',
  'Sevilla',
  'Zaragoza',
  'Málaga',
  'Bilbao',
  'Murcia',
  'Palma',
  'Las Palmas de Gran Canaria',
];
