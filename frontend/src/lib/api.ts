import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  ServiceSearchParams,
  CreateBookingDto,
  CreateReviewDto,
  Payment,
} from '@/types';
import { parametrosDeApi } from './busqueda';

// El navegador no llama a la API directamente sino a /api en el propio
// frontend, que la reenvía (ver proxy.ts): así la cookie de sesión es de este
// dominio. Por eso la dirección es relativa, y este cliente es solo para el
// navegador: en el servidor no hay origen al que referirla.
const API_URL = '/api';

// Sin timeout, una API que acepta la conexión pero no responde deja la
// interfaz cargando indefinidamente: la promesa nunca se resuelve, así que
// el catch del llamador no llega a ejecutarse y el spinner no desaparece.
const REQUEST_TIMEOUT_MS = 25000;

// La API vive en una instancia que se duerme por inactividad y tarda cerca de
// un minuto en volver. El primer intento se rinde pronto para no castigar al
// usuario cuando el servidor está caído de verdad, y el reintento espera más
// porque a esas alturas lo más probable es que solo esté arrancando.
const REINTENTO_TIMEOUT_MS = 45000;

interface PeticionConReintento extends InternalAxiosRequestConfig {
  reintentada?: boolean;
}

const api = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // El 401 se maneja en el llamador: cada página decide si redirigir
    // a /auth/login o mostrar un toast. Evitamos que una petición en
    // segundo plano borre la sesión o interrumpa un flujo en curso con
    // una navegación dura (window.location.href).
    const peticion = error.config as PeticionConReintento | undefined;
    const agotadoOSinRespuesta =
      error.code === 'ECONNABORTED' || !error.response;
    // Solo se reintentan las lecturas: repetir un POST podría duplicar una
    // reserva o un cobro.
    const esLectura = (peticion?.method || 'get').toLowerCase() === 'get';

    if (
      peticion &&
      esLectura &&
      agotadoOSinRespuesta &&
      !peticion.reintentada
    ) {
      peticion.reintentada = true;
      peticion.timeout = REINTENTO_TIMEOUT_MS;
      return api(peticion);
    }

    return Promise.reject(error);
  },
);

/**
 * Un identificador como tramo de una ruta, escapado.
 *
 * Next entrega los parámetros de la dirección ya descodificados: con
 * /services/..%2Fusers%2Fme, el «identificador» que llega es ../users/me, y
 * pegado tal cual a la ruta la petición acababa en otra distinta, con la
 * cookie de quien miraba. No había ninguna escritura alcanzable así, pero
 * la ruta la decidía quien escribía el enlace. Escapado, es solo un
 * identificador que no existe.
 */
const tramo = (valor: string) => encodeURIComponent(valor);

export const authApi = {
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: string;
    aceptaTerminos: boolean;
  }) => api.post('/auth/register', data),
  // Cierra las demás sesiones; esta sigue, con una cookie nueva.
  cambiarContrasena: (actual: string, nueva: string) =>
    api.post('/auth/cambiar-contrasena', { actual, nueva }),
  recuperar: (email: string, idioma: string) =>
    api.post('/auth/recuperar', { email, idioma }),
  restablecer: (token: string, nueva: string) =>
    api.post('/auth/restablecer', { token, nueva }),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  // Con el plazo largo: si la API está dormida, la cookie tiene que borrarse
  // igual cuando despierte, aunque para entonces la pantalla ya haya salido.
  logout: () =>
    api.post('/auth/logout', null, { timeout: REINTENTO_TIMEOUT_MS }),
  getProfile: () => api.get('/auth/profile'),
  socketTicket: () => api.get<{ ticket: string }>('/auth/socket-ticket'),
};

export const usersApi = {
  getAll: () => api.get('/users'),
  // El propio perfil. /users/:id es solo de administración: el perfil lo
  // pedía por ahí, y a clientes y profesionales no les cargaba.
  getMe: () => api.get('/users/me'),
  exportarDatos: () =>
    api.get<Blob>('/users/me/datos', { responseType: 'blob' }),
  eliminarCuenta: (contrasena: string) =>
    api.post('/users/me/eliminar', { contrasena }),
  updateProfile: (data: Record<string, unknown>) =>
    api.put('/users/profile', data),
  toggleActive: (id: string) => api.patch(`/users/${tramo(id)}/toggle-active`),
};

export const iaApi = {
  // POST y no GET: el interceptor reintenta los GET que agotan el
  // tiempo, y esta llamada puede costar dinero.
  asistente: (mensaje: string) => api.post('/ia/asistente', { mensaje }),
  estado: () => api.get('/ia/estado'),
  consumo: () => api.get('/ia/consumo'),
};

export const avisosApi = {
  listar: () => api.get('/notifications'),
  sinLeer: () => api.get('/notifications/unread/count'),
  marcarLeido: (id: string) => api.patch(`/notifications/${tramo(id)}/read`),
  marcarTodos: () => api.patch('/notifications/read-all'),
};

export const adminApi = {
  metricas: () => api.get('/admin/metricas'),
  reputacion: () => api.get('/admin/reputacion'),
  // Los pagos que alguien tiene que mirar: ver admin/pagos.tsx.
  pagos: () => api.get('/admin/pagos'),
  auditoria: (pagina: number) =>
    api.get('/admin/auditoria', { params: { pagina } }),
};

export const categoriesApi = {
  getAll: () => api.get('/categories'),
  create: (data: { name: string; slug: string; description?: string }) =>
    api.post('/categories', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/categories/${tramo(id)}`, data),
  remove: (id: string) => api.delete(`/categories/${tramo(id)}`),
};

export const servicesApi = {
  // Con los nombres de la API: ver parametrosDeApi.
  search: (params: ServiceSearchParams) =>
    api.get('/services/search', { params: parametrosDeApi(params) }),
  getById: (id: string) => api.get(`/services/${tramo(id)}`),
  // Los propios, con la dirección de referencia, que lo público ya no trae.
  getMine: () => api.get('/services/mine'),
  getByProvider: (providerId: string) =>
    api.get(`/services/provider/${tramo(providerId)}`),
  create: (data: Record<string, unknown>) => api.post('/services', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/services/${tramo(id)}`, data),
  remove: (id: string) => api.delete(`/services/${tramo(id)}`),
};

export const bookingsApi = {
  create: (data: CreateBookingDto) => api.post('/bookings', data),
  getMyBookings: () => api.get('/bookings/my'),
  getReceived: () => api.get('/bookings/received'),
  getById: (id: string) => api.get(`/bookings/${tramo(id)}`),
  // sinCobro: completar aunque no haya pago retenido. Ver cambiar-estado.ts.
  updateStatus: (
    id: string,
    status: string,
    opciones: { sinCobro?: boolean; cancellationReason?: string } = {},
  ) => api.patch(`/bookings/${tramo(id)}/status`, { status, ...opciones }),
};

export const reviewsApi = {
  create: (data: CreateReviewDto) => api.post('/reviews', data),
  getByService: (serviceId: string) =>
    api.get(`/reviews/service/${tramo(serviceId)}`),
  getMyReviews: () => api.get('/reviews/my'),
  respond: (id: string, providerResponse: string) =>
    api.patch(`/reviews/${tramo(id)}/response`, { providerResponse }),
  getReported: () => api.get('/reviews/reported'),
  dismissReport: (id: string) =>
    api.patch(`/reviews/${tramo(id)}/dismiss-report`),
  remove: (id: string) => api.delete(`/reviews/${tramo(id)}`),
};

export const messagesApi = {
  getConversations: () => api.get('/messages/conversations'),
  getConversation: (partnerId: string) =>
    api.get(`/messages/conversation/${tramo(partnerId)}`),
  // Leer el hilo ya no marca nada: es una escritura aparte.
  markRead: (partnerId: string) =>
    api.patch(`/messages/conversation/${tramo(partnerId)}/read`),
  send: (data: { receiverId: string; content: string }) =>
    api.post('/messages', data),
};

export const paymentsApi = {
  createIntent: (bookingId: string) =>
    api.post('/payments/create-intent', { bookingId }),
  confirm: (paymentIntentId: string) =>
    api.post(`/payments/confirm/${tramo(paymentIntentId)}`),
  // Sin pago, la API responde vacío.
  getByBooking: (bookingId: string) =>
    api.get<Payment | ''>(`/payments/booking/${tramo(bookingId)}`),
  // Las dos de la administración: cobrar lo retenido de una reserva
  // completada, y soltar o devolver el de una ya cerrada.
  capture: (bookingId: string) =>
    api.post(`/payments/capture/${tramo(bookingId)}`),
  refund: (bookingId: string) =>
    api.post(`/payments/refund/${tramo(bookingId)}`),
};

export default api;
