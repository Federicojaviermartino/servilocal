import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus } from '@/types';
import { cambiarEstadoReserva } from './cambiar-estado';
import { CODIGO_SIN_PAGO_RETENIDO } from './errores-api';

const updateStatus = vi.fn();
vi.mock('./api', () => ({
  bookingsApi: {
    updateStatus: (...argumentos: unknown[]) => updateStatus(...argumentos),
  },
}));

/** El rechazo con el que la API pide que el profesional decida. */
const SIN_RETENCION = {
  response: { status: 409, data: { codigo: CODIGO_SIN_PAGO_RETENIDO } },
};

describe('cambiarEstadoReserva', () => {
  beforeEach(() => {
    updateStatus.mockReset();
  });

  it('un cambio que la API acepta no pregunta nada', async () => {
    updateStatus.mockResolvedValue({ data: {} });
    const preguntar = vi.fn(() => true);

    expect(
      await cambiarEstadoReserva('b1', BookingStatus.COMPLETED, preguntar),
    ).toBe(true);
    expect(preguntar).not.toHaveBeenCalled();
    expect(updateStatus).toHaveBeenCalledTimes(1);
  });

  it('sin pago retenido, pregunta y, si acepta, completa sin cobro', async () => {
    updateStatus
      .mockRejectedValueOnce(SIN_RETENCION)
      .mockResolvedValueOnce({ data: {} });
    const preguntar = vi.fn(() => true);

    expect(
      await cambiarEstadoReserva('b1', BookingStatus.COMPLETED, preguntar),
    ).toBe(true);
    expect(preguntar).toHaveBeenCalledTimes(1);
    expect(updateStatus).toHaveBeenLastCalledWith(
      'b1',
      BookingStatus.COMPLETED,
      { sinCobro: true },
    );
  });

  it('si prefiere esperar, no vuelve a llamar', async () => {
    updateStatus.mockRejectedValueOnce(SIN_RETENCION);

    expect(
      await cambiarEstadoReserva('b1', BookingStatus.COMPLETED, () => false),
    ).toBe(false);
    expect(updateStatus).toHaveBeenCalledTimes(1);
  });

  it('cualquier otro rechazo sigue siendo un error', async () => {
    const fallo = { response: { status: 400, data: {} } };
    updateStatus.mockRejectedValueOnce(fallo);
    const preguntar = vi.fn(() => true);

    await expect(
      cambiarEstadoReserva('b1', BookingStatus.COMPLETED, preguntar),
    ).rejects.toBe(fallo);
    expect(preguntar).not.toHaveBeenCalled();
  });

  it('y ese código solo se atiende al completar', async () => {
    // Fuera de ahí sería un error inesperado, no una pregunta.
    updateStatus.mockRejectedValueOnce(SIN_RETENCION);
    const preguntar = vi.fn(() => true);

    await expect(
      cambiarEstadoReserva('b1', BookingStatus.CANCELLED, preguntar),
    ).rejects.toBe(SIN_RETENCION);
    expect(preguntar).not.toHaveBeenCalled();
  });
});
