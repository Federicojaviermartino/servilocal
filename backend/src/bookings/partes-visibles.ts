import { Booking, BookingStatus, User } from '../entities';

/**
 * Estados en los que cada parte ve el contacto de la otra.
 *
 * El profesional necesita el teléfono y la dirección del cliente para ir a
 * hacer el trabajo, pero solo cuando lo ha aceptado. Antes cada reserva
 * devolvía la ficha entera de la otra parte desde el primer momento: con
 * crear una reserva pendiente, sin pagar, y cancelarla, cualquier cliente
 * se llevaba el teléfono, el domicilio y las coordenadas del profesional.
 */
const CON_CONTACTO = new Set<BookingStatus>([
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
]);

/** Lo que se ve de una parte. Las coordenadas de su casa, nunca. */
export function parteVisible(
  usuario: User | undefined,
  conContacto: boolean,
): Partial<User> | undefined {
  if (!usuario) return usuario;

  const { id, firstName, lastName, avatarUrl, city } = usuario;
  const base: Partial<User> = { id, firstName, lastName, avatarUrl, city };
  if (!conContacto) return base;

  const { email, phone, address, postalCode } = usuario;
  return { ...base, email, phone, address, postalCode };
}

/** La reserva tal como la ve cualquiera de sus partes, o la moderación. */
export function reservaVisible(reserva: Booking): Booking {
  const conContacto = CON_CONTACTO.has(reserva.status);
  return {
    ...reserva,
    client: parteVisible(reserva.client, conContacto),
    provider: parteVisible(reserva.provider, conContacto),
  } as Booking;
}
