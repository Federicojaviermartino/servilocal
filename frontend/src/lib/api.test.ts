import type { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El interceptor de respuesta del cliente HTTP.
 *
 * Se extrae la función que axios registra en lugar de levantar un servidor:
 * lo que hay que comprobar es una decisión —reintentar o no— y no el
 * transporte.
 */
async function interceptor() {
  vi.resetModules();
  const registrados: Array<(e: AxiosError) => unknown> = [];

  vi.doMock('axios', () => {
    const instancia = Object.assign(
      vi.fn(async (config: unknown) => ({ reintentoDe: config })),
      {
        interceptors: {
          request: { use: vi.fn() },
          response: {
            use: (_ok: unknown, fallo: (e: AxiosError) => unknown) => {
              registrados.push(fallo);
            },
          },
        },
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    );
    return { default: { create: () => instancia }, AxiosError: class {} };
  });

  await import('./api');
  return registrados[0];
}

function fallo(
  metodo: string,
  opciones: { code?: string; conRespuesta?: boolean; reintentada?: boolean },
) {
  return {
    code: opciones.code,
    response: opciones.conRespuesta ? { status: 500 } : undefined,
    config: { method: metodo, reintentada: opciones.reintentada },
  } as unknown as AxiosError;
}

describe('reintento del cliente HTTP', () => {
  let alFallar: (e: AxiosError) => unknown;

  beforeEach(async () => {
    alFallar = await interceptor();
  });

  it('reintenta una lectura que agota el tiempo', async () => {
    const resultado = alFallar(fallo('get', { code: 'ECONNABORTED' }));

    await expect(resultado).resolves.toBeDefined();
  });

  it('reintenta una lectura que no obtiene respuesta', async () => {
    const resultado = alFallar(fallo('get', {}));

    await expect(resultado).resolves.toBeDefined();
  });

  it('no reintenta una escritura', async () => {
    // Repetir un POST podría duplicar una reserva o un cobro. Es la razón de
    // que esta distinción exista, y el motivo de que el asistente sea POST.
    for (const metodo of ['post', 'put', 'patch', 'delete']) {
      await expect(
        alFallar(fallo(metodo, { code: 'ECONNABORTED' })),
      ).rejects.toBeDefined();
    }
  });

  it('no reintenta dos veces la misma petición', async () => {
    // Sin esta marca, un servidor caído produce reintentos en cadena.
    await expect(
      alFallar(fallo('get', { code: 'ECONNABORTED', reintentada: true })),
    ).rejects.toBeDefined();
  });

  it('no reintenta cuando el servidor sí contestó', async () => {
    // Un 500 es una respuesta: repetirla da otro 500 y el doble de carga.
    await expect(
      alFallar(fallo('get', { conRespuesta: true })),
    ).rejects.toBeDefined();
  });

  it('trata una petición sin método como lectura', async () => {
    // axios omite el método cuando es el de por defecto, que es GET.
    const resultado = alFallar(fallo(undefined as never, {}));

    await expect(resultado).resolves.toBeDefined();
  });
});
