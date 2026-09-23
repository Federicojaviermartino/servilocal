import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authApi = {
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getProfile: vi.fn(),
};

vi.mock('@/lib/api', () => ({ authApi }));

type Modulo = typeof import('./auth-store');

const LAURA = {
  id: 'u1',
  email: 'laura@ejemplo.com',
  firstName: 'Laura',
  lastName: 'Gómez',
  role: 'client',
  soloLectura: false,
};

/** El módulo de cero, como en una carga de página nueva. */
async function cargar(): Promise<Modulo> {
  vi.resetModules();
  return import('./auth-store');
}

/** Una promesa que se resuelve cuando lo diga la prueba. */
function pendiente<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((si, no) => {
    resolver = si;
    rechazar = no;
  });
  return { promesa, resolver, rechazar };
}

const sinSesion = { response: { status: 401 } };

beforeEach(() => {
  for (const llamada of Object.values(authApi)) llamada.mockReset();
  authApi.logout.mockResolvedValue({});
});

afterEach(() => localStorage.clear());

describe('al entrar', () => {
  it('guarda quién es, pero ningún token', async () => {
    const { useAuthStore } = await cargar();
    authApi.login.mockResolvedValue({ data: { user: LAURA } });

    await useAuthStore.getState().login('laura@ejemplo.com', 'clave');

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual(LAURA);
    // La sesión es la cookie: en el almacenamiento del navegador no queda
    // nada que un script pueda llevarse para usarlo en otra parte.
    expect(Object.keys(localStorage)).toEqual(['user']);
  });

  it('el registro, igual', async () => {
    const { useAuthStore } = await cargar();
    authApi.register.mockResolvedValue({ data: { user: LAURA } });

    await useAuthStore.getState().register({} as never);

    expect(useAuthStore.getState().user).toEqual(LAURA);
    expect(Object.keys(localStorage)).toEqual(['user']);
  });

  it('si falla, no queda a medias', async () => {
    const { useAuthStore } = await cargar();
    authApi.login.mockRejectedValue(sinSesion);

    await expect(
      useAuthStore.getState().login('laura@ejemplo.com', 'mal'),
    ).rejects.toBe(sinSesion);

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      isLoading: false,
    });
  });
});

describe('al cargar la página', () => {
  it('borra el token que quedara de antes de la cookie', async () => {
    localStorage.setItem('accessToken', 'eyJ.antiguo.token');
    const { useAuthStore } = await cargar();

    useAuthStore.getState().loadFromStorage();

    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('pinta a quien recordaba sin esperar al servidor', async () => {
    localStorage.setItem('user', JSON.stringify(LAURA));
    authApi.getProfile.mockReturnValue(new Promise(() => undefined));
    const { useAuthStore } = await cargar();

    useAuthStore.getState().loadFromStorage();

    expect(useAuthStore.getState().user).toEqual(LAURA);
  });

  it('si la API dice que no hay sesión, la olvida', async () => {
    // La cookie caducó, o es de antes de este cambio y no existe.
    localStorage.setItem('user', JSON.stringify(LAURA));
    authApi.getProfile.mockRejectedValue(sinSesion);
    const { useAuthStore } = await cargar();

    useAuthStore.getState().loadFromStorage();

    await vi.waitFor(() =>
      expect(useAuthStore.getState().isAuthenticated).toBe(false),
    );
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('si la API no contesta, sigue con lo recordado', async () => {
    // Dormida o sin red no es lo mismo que sin sesión: echar a alguien por
    // eso le haría volver a entrar cada vez que Render duerme la API.
    localStorage.setItem('user', JSON.stringify(LAURA));
    authApi.getProfile.mockRejectedValue({ code: 'ECONNABORTED' });
    const { useAuthStore } = await cargar();

    useAuthStore.getState().loadFromStorage();
    await Promise.resolve();
    await Promise.resolve();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('se queda con lo que diga la API, no con lo recordado', async () => {
    localStorage.setItem('user', JSON.stringify(LAURA));
    authApi.getProfile.mockResolvedValue({
      data: { ...LAURA, soloLectura: true, phone: '600123456' },
    });
    const { useAuthStore } = await cargar();

    useAuthStore.getState().loadFromStorage();

    await vi.waitFor(() =>
      expect(useAuthStore.getState().user?.soloLectura).toBe(true),
    );
    // Solo lo de la sesión; el perfil completo no se guarda aquí.
    expect(useAuthStore.getState().user).not.toHaveProperty('phone');
  });

  it('pregunta una sola vez aunque lo pidan varias pantallas', async () => {
    localStorage.setItem('user', JSON.stringify(LAURA));
    authApi.getProfile.mockReturnValue(new Promise(() => undefined));
    const { useAuthStore } = await cargar();

    useAuthStore.getState().loadFromStorage();
    useAuthStore.getState().loadFromStorage();
    useAuthStore.getState().loadFromStorage();

    expect(authApi.getProfile).toHaveBeenCalledTimes(1);
  });

  it('sin nada recordado no pregunta', async () => {
    const { useAuthStore } = await cargar();

    useAuthStore.getState().loadFromStorage();

    expect(authApi.getProfile).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('respuestas que llegan tarde', () => {
  it('quien sale mientras se comprobaba no vuelve a entrar', async () => {
    localStorage.setItem('user', JSON.stringify(LAURA));
    const perfil = pendiente<unknown>();
    authApi.getProfile.mockReturnValue(perfil.promesa);
    const { useAuthStore } = await cargar();
    useAuthStore.getState().loadFromStorage();

    await useAuthStore.getState().logout();
    perfil.resolver({ data: LAURA });
    await perfil.promesa;
    await Promise.resolve();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('quien entra mientras se comprobaba no es expulsado', async () => {
    // La comprobación salió con la cookie vieja, que ya no valía; su 401
    // llega después de que la persona haya vuelto a entrar.
    localStorage.setItem('user', JSON.stringify(LAURA));
    const perfil = pendiente<unknown>();
    authApi.getProfile.mockReturnValue(perfil.promesa);
    authApi.login.mockResolvedValue({ data: { user: LAURA } });
    const { useAuthStore } = await cargar();
    useAuthStore.getState().loadFromStorage();

    await useAuthStore.getState().login('laura@ejemplo.com', 'clave');
    perfil.rechazar(sinSesion);
    await perfil.promesa.catch(() => undefined);
    await Promise.resolve();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(localStorage.getItem('user')).not.toBeNull();
  });
});

describe('al salir', () => {
  it('la pantalla cambia en el acto y la API borra la cookie', async () => {
    const { useAuthStore } = await cargar();
    authApi.login.mockResolvedValue({ data: { user: LAURA } });
    await useAuthStore.getState().login('laura@ejemplo.com', 'clave');
    const respuesta = pendiente<unknown>();
    authApi.logout.mockReturnValue(respuesta.promesa);

    const saliendo = useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    respuesta.resolver({});
    await saliendo;
  });

  it('aunque la API no conteste, no revienta', async () => {
    const { useAuthStore } = await cargar();
    authApi.logout.mockRejectedValue(new Error('sin red'));

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('haySesionRecordada', () => {
  it('sigue a lo guardado, que es lo que hay antes del primer render', async () => {
    const { haySesionRecordada } = await cargar();

    expect(haySesionRecordada()).toBe(false);
    localStorage.setItem('user', JSON.stringify(LAURA));
    expect(haySesionRecordada()).toBe(true);
  });

  it('un token antiguo suelto no cuenta como sesión', async () => {
    localStorage.setItem('accessToken', 'eyJ.antiguo.token');
    const { haySesionRecordada } = await cargar();

    expect(haySesionRecordada()).toBe(false);
  });
});
