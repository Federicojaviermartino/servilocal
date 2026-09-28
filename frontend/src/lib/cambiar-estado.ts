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
 *
 * Al cancelar o rechazar puede ir un motivo, que ve la otra parte.
 */
export async function cambiarEstadoReserva(
  id: string,
  estado: BookingStatus,
  confirmarSinCobro: () => boolean,
  motivo?: string,
): Promise<boolean> {
  try {
    if (motivo) {
      await bookingsApi.updateStatus(id, estado, {
        cancellationReason: motivo,
      });
    } else {
      await bookingsApi.updateStatus(id, estado);
    }
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

/** Cuánto admite la API. */
const MAXIMO_MOTIVO = 500;

/**
 * Pregunta antes de cancelar o rechazar, y deja escribir el motivo.
 *
 * Cancelar no pedía confirmación: un clic y la reserva quedaba cancelada. Y
 * la API guarda un motivo que la interfaz no pedía nunca. null si se echa
 * atrás; una cadena vacía si sigue adelante sin motivo.
 */
export function preguntarMotivo(pregunta: string): string | null {
  const respuesta = window.prompt(pregunta, '');
  if (respuesta === null) return null;
  return respuesta.trim().slice(0, MAXIMO_MOTIVO);
}
