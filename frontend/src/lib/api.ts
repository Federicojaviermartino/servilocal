import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  ServiceSearchParams,
  CreateBookingDto,
  CreateReviewDto,
} from '@/types';

// En produccion NEXT_PUBLIC_API_URL debe inyectarse como build arg en Docker.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // El 401 se maneja en el llamador: cada pagina decide si redirigir
    // a /auth/login o mostrar un toast. Evitamos que una peticion en
    // segundo plano borre la sesion o interrumpa un flujo en curso con
    // una navegacion dura (window.location.href).
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

export const authApi = {
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: string;
  }) => api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
};

export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id: string) => api.get(`/users/${id}`),
  updateProfile: (data: Record<string, unknown>) =>
    api.put('/users/profile', data),
  toggleActive: (id: string) => api.patch(`/users/${id}/toggle-active`),
};

export const adminApi = {
  metricas: () => api.get('/admin/metricas'),
  reputacion: () => api.get('/admin/reputacion'),
};

export const categoriesApi = {
  getAll: () => api.get('/categories'),
  getById: (id: string) => api.get(`/categories/${id}`),
  create: (data: { name: string; slug: string; description?: string }) =>
    api.post('/categories', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/categories/${id}`, data),
  remove: (id: string) => api.delete(`/categories/${id}`),
};

export const servicesApi = {
  search: (params: ServiceSearchParams) =>
    api.get('/services/search', { params }),
  getById: (id: string) => api.get(`/services/${id}`),
  getByProvider: (providerId: string) =>
    api.get(`/services/provider/${providerId}`),
  create: (data: Record<string, unknown>) => api.post('/services', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/services/${id}`, data),
  remove: (id: string) => api.delete(`/services/${id}`),
};

export const bookingsApi = {
  create: (data: CreateBookingDto) => api.post('/bookings', data),
  getMyBookings: () => api.get('/bookings/my'),
  getReceived: () => api.get('/bookings/received'),
  getById: (id: string) => api.get(`/bookings/${id}`),
  updateStatus: (id: string, status: string) =>
    api.patch(`/bookings/${id}/status`, { status }),
};

export const reviewsApi = {
  create: (data: CreateReviewDto) => api.post('/reviews', data),
  getByService: (serviceId: string) => api.get(`/reviews/service/${serviceId}`),
  getMyReviews: () => api.get('/reviews/my'),
  respond: (id: string, providerResponse: string) =>
    api.patch(`/reviews/${id}/response`, { providerResponse }),
  getReported: () => api.get('/reviews/reported'),
  dismissReport: (id: string) => api.patch(`/reviews/${id}/dismiss-report`),
  remove: (id: string) => api.delete(`/reviews/${id}`),
};

export const messagesApi = {
  getConversations: () => api.get('/messages/conversations'),
  getConversation: (partnerId: string) =>
    api.get(`/messages/conversation/${partnerId}`),
  send: (data: { receiverId: string; content: string }) =>
    api.post('/messages', data),
};

export const paymentsApi = {
  createIntent: (bookingId: string) =>
    api.post('/payments/create-intent', { bookingId }),
  confirm: (paymentIntentId: string) =>
    api.post(`/payments/confirm/${paymentIntentId}`),
};

export default api;
