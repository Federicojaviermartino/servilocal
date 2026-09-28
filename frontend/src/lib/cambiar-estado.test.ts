import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus } from '@/types';
import { cambiarEstadoReserva, preguntarMotivo } from './cambiar-estado';
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

describe('el motivo al cancelar o rechazar', () => {
  beforeEach(() => {
    updateStatus.mockReset();
    updateStatus.mockResolvedValue({ data: {} });
  });

  it('viaja con el cambio, y lo ve la otra parte', async () => {
    await cambiarEstadoReserva(
      'b1',
      BookingStatus.CANCELLED,
      () => true,
      'Me ha surgido un viaje',
    );

    expect(updateStatus).toHaveBeenCalledWith('b1', BookingStatus.CANCELLED, {
      cancellationReason: 'Me ha surgido un viaje',
    });
  });

  it('sin motivo, el cambio va como siempre', async () => {
    await cambiarEstadoReserva('b1', BookingStatus.CANCELLED, () => true, '');

    expect(updateStatus).toHaveBeenCalledWith('b1', BookingStatus.CANCELLED);
  });

  it('echarse atrás en la pregunta no cancela nada', () => {
    // Cancelar no pedía confirmación: un clic y quedaba cancelada.
    vi.spyOn(window, 'prompt').mockReturnValue(null);

    expect(preguntarMotivo('¿Cancelar?')).toBeNull();
  });

  it('el motivo llega sin espacios de más y dentro de lo que admite la API', () => {
    vi.spyOn(window, 'prompt').mockReturnValue(`  ${'a'.repeat(600)}  `);

    expect(preguntarMotivo('¿Cancelar?')).toBe('a'.repeat(500));
  });

  it('aceptar sin escribir nada sigue adelante, sin motivo', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('');

    expect(preguntarMotivo('¿Cancelar?')).toBe('');
  });
});
