import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCarga } from './carga';

/** Un fallo de axios con el código que se quiera. */
const fallo = (status?: number) => ({
  response: status === undefined ? undefined : { status },
});

describe('useCarga', () => {
  it('entrega los datos cuando la petición va bien', async () => {
    const { result } = renderHook(() =>
      useCarga(async () => ({ data: [{ id: 'b1' }] })),
    );

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual([{ id: 'b1' }]);
  });

  it('empieza cargando, no vacío', async () => {
    // El primer render decidía qué pintar, y con la lista vacía pintaba
    // «no tienes nada» antes incluso de haber preguntado.
    const { result } = renderHook(() => useCarga(async () => ({ data: [] })));

    expect(result.current.estado).toBe('cargando');
    await waitFor(() => expect(result.current.estado).toBe('listo'));
  });

  it('una lista vacía es un resultado válido, no un error', async () => {
    const { result } = renderHook(() => useCarga(async () => ({ data: [] })));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual([]);
  });

  it('un fallo de red no se confunde con no tener nada', async () => {
    const { result } = renderHook(() =>
      useCarga(() => Promise.reject(fallo())),
    );

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.datos).toBeNull();
  });

  it('un 500 también es error', async () => {
    const { result } = renderHook(() =>
      useCarga(() => Promise.reject(fallo(500))),
    );

    await waitFor(() => expect(result.current.estado).toBe('error'));
  });

  it('un 401 se distingue: la sesión ha caducado', async () => {
    // El remedio es otro. Reintentar con la misma credencial caducada
    // devolvería otro 401, y así indefinidamente.
    const { result } = renderHook(() =>
      useCarga(() => Promise.reject(fallo(401))),
    );

    await waitFor(() => expect(result.current.estado).toBe('sesion'));
  });

  it('reintentar vuelve a pedirlo y puede salir bien', async () => {
    const pedir = vi
      .fn()
      .mockRejectedValueOnce(fallo(503))
      .mockResolvedValueOnce({ data: ['ya está'] });

    const { result } = renderHook(() => useCarga(pedir));
    await waitFor(() => expect(result.current.estado).toBe('error'));

    result.current.reintentar();

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos).toEqual(['ya está']);
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('no pide una vez por render', async () => {
    // La función llega nueva en cada render: sin fijarla, cada respuesta
    // provocaría otra petición y no pararía nunca.
    const pedir = vi.fn(async () => ({ data: [] }));
    const { rerender, result } = renderHook(() => useCarga(pedir, ['fijo']));

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    rerender();
    rerender();

    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('al cambiar lo que se pide vuelve a cargando en ese mismo render', async () => {
    // Antes el «cargando» se ponía dentro del efecto, así que había un
    // render con el identificador nuevo y el estado viejo: la pantalla
    // enseñaba por un momento los datos de lo anterior como si fueran lo
    // que se acababa de pedir.
    const pedir = vi.fn(async (id: string) => ({ data: `datos de ${id}` }));
    const { result, rerender } = renderHook(
      ({ id }) => useCarga(() => pedir(id), [id]),
      { initialProps: { id: 'a' } },
    );
    await waitFor(() => expect(result.current.estado).toBe('listo'));

    rerender({ id: 'b' });

    expect(result.current.estado).toBe('cargando');
    await waitFor(() => expect(result.current.datos).toBe('datos de b'));
    expect(result.current.estado).toBe('listo');
  });

  it('un error del servidor trae el identificador de la petición', async () => {
    // Es lo que sale en el registro de la API: con él se encuentra el fallo.
    const pedir = vi.fn().mockRejectedValue({
      response: {
        status: 500,
        headers: { 'x-request-id': 'reserva-7f3a9c21' },
      },
    });
    const { result } = renderHook(() => useCarga(pedir));

    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.referencia).toBe('reserva-7f3a9c21');
  });

  it.each([
    [
      'un 404',
      { response: { status: 404, headers: { 'x-request-id': 'r-12345678' } } },
    ],
    ['sin red', { code: 'ERR_NETWORK' }],
  ])(
    '%s no trae referencia: no hay nada que buscar en el registro',
    async (_caso, error) => {
      const pedir = vi.fn().mockRejectedValue(error);
      const { result } = renderHook(() => useCarga(pedir));

      await waitFor(() => expect(result.current.estado).toBe('error'));
      expect(result.current.referencia).toBeUndefined();
    },
  );

  it('una respuesta que llega tarde no pisa el estado actual', async () => {
    // Al desmontar la pantalla, la petición sigue viva: escribir entonces
    // avisa de una fuga y, peor, revive datos de una vista que ya no está.
    let resolver: (v: { data: string[] }) => void = () => undefined;
    const pedir = vi.fn(
      () =>
        new Promise<{ data: string[] }>((r) => {
          resolver = r;
        }),
    );

    const { unmount, result } = renderHook(() => useCarga(pedir));
    unmount();
    resolver({ data: ['tarde'] });

    expect(result.current.estado).toBe('cargando');
  });
});
