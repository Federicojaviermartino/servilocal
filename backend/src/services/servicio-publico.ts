import type { Service } from '../entities';

/**
 * Un servicio tal como lo ve quien no es su dueño: sin su dirección de
 * referencia.
 *
 * Es obligatoria al publicar, y quien ponía la de su casa la publicaba sin
 * saberlo: la búsqueda, la ficha y la lista de un profesional la devolvían
 * a cualquiera, aunque la interfaz no la enseña, y las reservas, los pagos y
 * las valoraciones, que traen el servicio entero, se la daban a la otra
 * parte. Solo la ve su dueño, desde su panel.
 */
export function servicioPublico(servicio: Service): Omit<Service, 'address'> {
  const publico: Partial<Service> = { ...servicio };
  delete publico.address;
  return publico as Omit<Service, 'address'>;
}
