import { BookingStatus } from '@/types';

/**
 * Estado de una reserva a clave del catálogo y a color del distintivo.
 *
 * Vive aquí y no en cada pantalla porque tres vistas distintas pintan el mismo
 * estado, y si cada una lo traduce a su manera acaban discrepando.
 */
export const CLAVE_ESTADO = {
  [BookingStatus.PENDING]: 'pendiente',
  [BookingStatus.CONFIRMED]: 'confirmada',
  [BookingStatus.COMPLETED]: 'completada',
  [BookingStatus.CANCELLED]: 'cancelada',
  [BookingStatus.REJECTED]: 'rechazada',
} as const;

export type ClaveEstado = (typeof CLAVE_ESTADO)[keyof typeof CLAVE_ESTADO];

export const VARIANTE_ESTADO: Record<
  BookingStatus,
  'default' | 'success' | 'warning' | 'danger' | 'info'
> = {
  [BookingStatus.PENDING]: 'warning',
  [BookingStatus.CONFIRMED]: 'info',
  [BookingStatus.COMPLETED]: 'success',
  [BookingStatus.CANCELLED]: 'default',
  [BookingStatus.REJECTED]: 'danger',
};
