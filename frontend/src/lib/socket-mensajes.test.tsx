import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El socket compartido de la pestaña.
 *
 * Lo que hay que comprobar no es el transporte sino las decisiones que hay
 * alrededor: una sola conexión para toda la pestaña, el pase fuera de la
 * URL, uno nuevo en cada intento, y cerrar solo cuando no queda nadie
 * escuchando. Abrir una conexión por componente gasta una ranura del
 * servidor por pantalla visitada.
 */
const sockets: Array<{
  manejadores: Record<string, Array<(dato: unknown) => void>>;
  connected: boolean;
  disconnect: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emitir: (evento: string, dato?: unknown) => void;
}> = [];

const io = vi.fn((_url: string, _opciones?: unknown) => {
  const manejadores: Record<string, Array<(dato: unknown) => void>> = {};
  const socket = {
    manejadores,
    connected: false,
    disconnect: vi.fn(),
    off: vi.fn((evento: string, fn: (dato: unknown) => void) => {
      manejadores[evento] = (manejadores[evento] ?? []).filter((f) => f !== fn);
    }),
    on: vi.fn((evento: string, fn: (dato: unknown) => void) => {
      (manejadores[evento] ??= []).push(fn);
      return socket;
    }),
    emitir: (evento: string, dato?: unknown) => {
      for (const fn of manejadores[evento] ?? []) fn(dato);
    },
  };
  sockets.push(socket);
  return socket;
});

vi.mock('socket.io-client', () => ({
  io: (url: string, opciones?: unknown) => io(url, opciones),
}));

const socketTicket = vi.fn();

vi.mock('@/lib/api', () => ({
  authApi: { socketTicket: () => socketTicket() },
}));

type Modulo = typeof import('./socket-mensajes');
type Almacen = typeof import('./auth-store');
let almacen: Almacen;

/** Carga el módulo de cero, con sesión o sin ella. */
async function cargar(conSesion = true): Promise<Modulo> {
  vi.resetModules();
  almacen = await import('./auth-store');
  almacen.useAuthStore.setState({ isAuthenticated: conSesion });
  return import('./socket-mensajes');
}

/** Lo que el socket manda en el apretón de manos de un intento. */
function apretonDeManos(): Promise<{ token?: string }> {
  const [, opciones] = io.mock.calls.at(-1) as unknown as [
    string,
    { auth: (entregar: (datos: { token?: string }) => void) => void },
  ];
  return new Promise((entregar) => opciones.auth(entregar));
}

beforeEach(() => {
  sockets.length = 0;
  io.mockClear();
  socketTicket.mockReset();
  socketTicket.mockResolvedValue({ data: { ticket: 'pase-de-prueba' } });
});

afterEach(() => {
  localStorage.clear();
});

describe('socket compartido', () => {
  it('sin sesión no abre ninguna conexión', async () => {
    // Quien no ha entrado no tiene nada que escuchar, y el servidor
    // rechazaría el apretón de manos de todas formas.
    const { useAvisosEnVivo } = await cargar(false);

    renderHook(() => useAvisosEnVivo(() => undefined));

    expect(io).not.toHaveBeenCalled();
  });

  it('el pase viaja en el apretón de manos, no en la URL', async () => {
    // Las cadenas de consulta acaban escritas en los registros del servidor
    // y en los del proxy de delante.
    const { useAvisosEnVivo } = await cargar();

    renderHook(() => useAvisosEnVivo(() => undefined));

    const [url] = io.mock.calls[0] as unknown as [string];
    expect(await apretonDeManos()).toEqual({ token: 'pase-de-prueba' });
    expect(url).not.toContain('pase-de-prueba');
  });

  it('pide un pase nuevo en cada intento, reconexiones incluidas', async () => {
    // Duran un minuto. Con el primero guardado, tras una caída larga el
    // socket no podría volver nunca.
    const { useAvisosEnVivo } = await cargar();
    renderHook(() => useAvisosEnVivo(() => undefined));
    socketTicket.mockResolvedValueOnce({ data: { ticket: 'primero' } });
    socketTicket.mockResolvedValueOnce({ data: { ticket: 'segundo' } });

    expect(await apretonDeManos()).toEqual({ token: 'primero' });
    expect(await apretonDeManos()).toEqual({ token: 'segundo' });
  });

  it('sin pase se presenta sin nada, y el servidor dirá que no', async () => {
    // Si la sesión caducó, la API no da pase. Quedarse esperando dejaría el
    // socket colgado; presentarse sin él hace que el servidor conteste con
    // «sesion-invalida», que es lo que corta los reintentos.
    socketTicket.mockRejectedValue(new Error('401'));
    const { useAvisosEnVivo } = await cargar();
    renderHook(() => useAvisosEnVivo(() => undefined));

    expect(await apretonDeManos()).toEqual({});
  });

  it('al salir de la sesión se cierra', async () => {
    const { useAvisosEnVivo } = await cargar();
    renderHook(() => useAvisosEnVivo(() => undefined));

    act(() => almacen.useAuthStore.setState({ isAuthenticated: false }));

    expect(sockets[0].disconnect).toHaveBeenCalled();
  });

  it('el socket cuelga de la raíz del servidor, no de /api', async () => {
    const { useAvisosEnVivo } = await cargar();

    renderHook(() => useAvisosEnVivo(() => undefined));

    const [url] = io.mock.calls[0] as unknown as [string];
    expect(url.endsWith('/mensajes')).toBe(true);
    expect(url).not.toContain('/api/');
  });

  it('avisos y mensajes comparten una sola conexión', async () => {
    // Son dos suscripciones sobre el mismo socket: abrir una segunda
    // gastaría el doble de ranuras del servidor para nada.
    const { useAvisosEnVivo, useMensajesEnVivo } = await cargar();

    renderHook(() => useAvisosEnVivo(() => undefined));
    renderHook(() => useMensajesEnVivo(() => undefined));

    expect(io).toHaveBeenCalledTimes(1);
  });

  it('con un suscriptor todavía escuchando, no se cierra', async () => {
    const { useAvisosEnVivo, useMensajesEnVivo } = await cargar();
    const primero = renderHook(() => useAvisosEnVivo(() => undefined));
    renderHook(() => useMensajesEnVivo(() => undefined));

    primero.unmount();

    expect(sockets[0].disconnect).not.toHaveBeenCalled();
  });

  it('al marcharse el último se cierra', async () => {
    const { useAvisosEnVivo } = await cargar();
    const vista = renderHook(() => useAvisosEnVivo(() => undefined));

    vista.unmount();

    expect(sockets[0].disconnect).toHaveBeenCalled();
  });

  it('una sesión inválida deja de intentarlo', async () => {
    // Reconectar sería insistir con la misma credencial caducada, una y otra
    // vez, contra un servidor que ya ha dicho que no.
    const { useAvisosEnVivo } = await cargar();
    renderHook(() => useAvisosEnVivo(() => undefined));

    act(() => sockets[0].emitir('sesion-invalida'));

    expect(sockets[0].disconnect).toHaveBeenCalled();
  });
});

describe('lo que llega por el socket', () => {
  it('un aviso nuevo llega al componente', async () => {
    const { useAvisosEnVivo } = await cargar();
    const recibido = vi.fn();
    renderHook(() => useAvisosEnVivo(recibido));

    act(() => sockets[0].emitir('aviso-nuevo', { id: 'a1', type: 'system' }));

    expect(recibido).toHaveBeenCalledWith({ id: 'a1', type: 'system' });
  });

  it('un mensaje nuevo llega por su propio evento', async () => {
    const { useMensajesEnVivo } = await cargar();
    const recibido = vi.fn();
    renderHook(() => useMensajesEnVivo(recibido));

    act(() => sockets[0].emitir('mensaje-nuevo', { interlocutorId: 'u2' }));

    expect(recibido).toHaveBeenCalledWith({ interlocutorId: 'u2' });
  });

  it('cambiar el manejador no vuelve a suscribir', async () => {
    // El manejador se recrea en cada render. Sin la referencia, escribir en
    // un campo desuscribiría y volvería a suscribir con cada tecla.
    const { useAvisosEnVivo } = await cargar();
    const vista = renderHook(({ fn }) => useAvisosEnVivo(fn), {
      initialProps: { fn: vi.fn() },
    });

    const segundo = vi.fn();
    vista.rerender({ fn: segundo });
    act(() => sockets[0].emitir('aviso-nuevo', { id: 'a2' }));

    expect(sockets[0].off).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledWith({ id: 'a2' });
  });

  it('el estado de conexión sigue al socket', async () => {
    // Quien lo use puede seguir refrescando por HTTP mientras no haya
    // socket: en Render el servicio se duerme y hay redes que los cortan.
    const { useAvisosEnVivo } = await cargar();
    const vista = renderHook(() => useAvisosEnVivo(() => undefined));

    expect(vista.result.current.conectado).toBe(false);

    act(() => sockets[0].emitir('connect'));
    expect(vista.result.current.conectado).toBe(true);

    act(() => sockets[0].emitir('disconnect'));
    expect(vista.result.current.conectado).toBe(false);
  });
});
