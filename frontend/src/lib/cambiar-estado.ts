import { BookingStatus } from '@/types';
import { bookingsApi } from './api';
import { CODIGO_SIN_PAGO_RETENIDO, codigoDeError } from './errores-api';

/**
 * Cambia el estado de una reserva, y pregunta si al completarla no hay
 * nada retenido.
 *
 * La API ya no completa en silencio una reserva sin pago: antes quedaba
 * cerrada sin cobrar, sin que el profesional lo supiera, y ya no había
 * forma de pagarla. Ahora responde 409 con su código, y el profesional
 * decide si espera a que el cliente pague o la da por hecha sin cobro, para
 * que el cliente pague después.
 *
 * Devuelve false si decide esperar: la reserva se queda como estaba.
 */
export async function cambiarEstadoReserva(
  id: string,
  estado: BookingStatus,
  confirmarSinCobro: () => boolean,
): Promise<boolean> {
  try {
    await bookingsApi.updateStatus(id, estado);
    return true;
  } catch (error) {
    if (
      estado !== BookingStatus.COMPLETED ||
      codigoDeError(error) !== CODIGO_SIN_PAGO_RETENIDO
    ) {
      throw error;
    }
    if (!confirmarSinCobro()) return false;
    await bookingsApi.updateStatus(id, estado, { sinCobro: true });
    return true;
  }
}
