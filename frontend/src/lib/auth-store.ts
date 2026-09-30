import { create } from 'zustand';
import { authApi } from '@/lib/api';
import { AuthResponse } from '@/types';

type UsuarioSesion = AuthResponse['user'];

/**
 * La sesión la lleva una cookie que JavaScript no puede leer. Lo que se
 * guarda aquí es solo quién es, para pintar la cabecera y el panel sin
 * esperar al servidor en cada carga. No abre nada: quien decide si hay
 * sesión es la API, y al cargar se le pregunta.
 */
const CLAVE_USUARIO = 'user';

/** Donde vivía el token antes de la cookie. Se borra allí donde quede. */
const CLAVE_ANTIGUA = 'accessToken';

/**
 * Lo que se estaba escribiendo cuando caducó la sesión (ver borrador.ts).
 * Vive aquí porque salir lo borra.
 */
export const PREFIJO_BORRADOR = 'borrador:';

interface AuthState {
  user: UsuarioSesion | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: string;
    aceptaTerminos: boolean;
  }) => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => void;
}

function leerGuardado(): UsuarioSesion | null {
  const texto = localStorage.getItem(CLAVE_USUARIO);
  if (!texto) return null;
  try {
    return JSON.parse(texto) as UsuarioSesion;
  } catch {
    localStorage.removeItem(CLAVE_USUARIO);
    return null;
  }
}

function guardar(usuario: UsuarioSesion): void {
  localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
}

function olvidar(): void {
  localStorage.removeItem(CLAVE_USUARIO);
  localStorage.removeItem(CLAVE_ANTIGUA);
}

/**
 * Los borradores de la pestaña, de quien fuera. Al salir: la siguiente
 * cuenta que entrara en ella recibía el teléfono y la dirección que la
 * anterior había dejado a medias en su perfil.
 */
function olvidarBorradores(): void {
  try {
    for (const clave of Object.keys(sessionStorage)) {
      if (clave.startsWith(PREFIJO_BORRADOR)) sessionStorage.removeItem(clave);
    }
  } catch {
    // Sin almacenamiento no hay nada que olvidar.
  }
}

/**
 * Quién ha entrado en este navegador: el del almacén o, antes de que se
 * cargue, el recordado. Los borradores se guardan con él.
 */
export function idRecordado(): string | null {
  const enElAlmacen = useAuthStore.getState().user?.id;
  if (enElAlmacen) return enElAlmacen;
  return typeof window === 'undefined' ? null : (leerGuardado()?.id ?? null);
}

/**
 * Otra pestaña entró con otra cuenta, o salió. La cookie es la misma para
 * todas, así que esta seguiría enseñando a la persona anterior y guardaría
 * lo que se escribiera en ella en la cuenta nueva: se recarga.
 */
/** Aparte, para poder comprobarlo: jsdom no deja sustituir location. */
export const pestana = { recargar: () => window.location.reload() };

function alCambiarOtraPestana(evento: StorageEvent): void {
  if (evento.key !== CLAVE_USUARIO && evento.key !== null) return;
  const aqui = useAuthStore.getState().user?.id ?? null;
  const alli = leerGuardado()?.id ?? null;
  if (aqui !== alli) pestana.recargar();
}

let escuchando = false;

function escucharOtrasPestanas(): void {
  if (escuchando) return;
  escuchando = true;
  window.addEventListener('storage', alCambiarOtraPestana);
}

/** Para las pruebas, que cargan el módulo de cero en cada una. */
export function dejarDeEscucharPestanas(): void {
  escuchando = false;
  window.removeEventListener('storage', alCambiarOtraPestana);
}

/**
 * Si hay una sesión recordada en este navegador.
 *
 * Para las pantallas protegidas en su primer render, cuando el almacén
 * todavía no se ha cargado: sin esto mandarían a entrar a quien ya había
 * entrado.
 */
export function haySesionRecordada(): boolean {
  return (
    typeof window !== 'undefined' &&
    localStorage.getItem(CLAVE_USUARIO) !== null
  );
}

/** Una sola comprobación por carga de página, la pidan cuantos la pidan. */
let comprobada = false;

/**
 * Cuenta las veces que alguien entra o sale. La comprobación con el servidor
 * puede tardar lo que tarde la API en despertar, y si mientras tanto la
 * persona sale, o entra con otra cuenta, su respuesta ya no vale: aplicarla
 * la volvería a meter, o la echaría recién entrada.
 */
let generacion = 0;

export const useAuthStore = create<AuthState>((set) => {
  const entrar = (usuario: UsuarioSesion) => {
    generacion += 1;
    guardar(usuario);
    comprobada = true;
    set({ user: usuario, isAuthenticated: true, isLoading: false });
  };

  const salir = () => {
    generacion += 1;
    olvidar();
    set({ user: null, isAuthenticated: false });
  };

  return {
    user: null,
    isLoading: false,
    isAuthenticated: false,

    login: async (email, password) => {
      set({ isLoading: true });
      try {
        const { data } = await authApi.login({ email, password });
        entrar(data.user);
      } catch (error) {
        set({ isLoading: false });
        throw error;
      }
    },

    register: async (registerData) => {
      set({ isLoading: true });
      try {
        const { data } = await authApi.register(registerData);
        entrar(data.user);
      } catch (error) {
        set({ isLoading: false });
        throw error;
      }
    },

    logout: async () => {
      // Primero aquí, para que la pantalla cambie en el acto aunque la API
      // tarde en contestar. La cookie la borra ella. Los borradores, solo
      // al salir a propósito: con la sesión caducada es cuando hacen falta.
      salir();
      olvidarBorradores();
      try {
        await authApi.logout();
      } catch {
        // Sin conexión la cookie se queda hasta que caduque, pero la
        // interfaz ya no la usa y no hay nada que el usuario pueda hacer.
      }
    },

    loadFromStorage: () => {
      if (typeof window === 'undefined') return;
      localStorage.removeItem(CLAVE_ANTIGUA);
      escucharOtrasPestanas();

      const guardado = leerGuardado();
      if (!guardado) return;
      set({ user: guardado, isAuthenticated: true });

      if (comprobada) return;
      comprobada = true;
      const mia = generacion;

      // La cookie puede haber caducado, o ser de antes de este cambio y no
      // existir. La API lo sabe; aquí solo se recordaba quién era.
      authApi.getProfile().then(
        ({ data }) => {
          if (mia !== generacion) return;
          entrar({
            id: data.id,
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            role: data.role,
            soloLectura: data.soloLectura ?? false,
            esDemostracion: data.esDemostracion ?? false,
          });
        },
        (error: { response?: { status?: number } }) => {
          // Solo un 401 es «no hay sesión». Si la API está dormida o no
          // hay red, se sigue con lo recordado y ya fallará lo que haga
          // falta.
          if (mia === generacion && error.response?.status === 401) salir();
        },
      );
    },
  };
});
