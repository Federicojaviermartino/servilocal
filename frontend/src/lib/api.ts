import axios from 'axios';
import {
  ServiceSearchParams,
  CreateBookingDto,
  CreateReviewDto,
} from '@/types';

// En produccion NEXT_PUBLIC_API_URL debe inyectarse como build arg en Docker.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
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
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      if (!window.location.pathname.startsWith('/auth/')) {
        window.location.href = '/auth/login';
      }
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
  getAll: (params?: { page?: number; limit?: number }) =>
    api.get('/services', { params }),
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
  cancel: (id: string) => api.patch(`/bookings/${id}/cancel`),
};

export const reviewsApi = {
  create: (data: CreateReviewDto) => api.post('/reviews', data),
  getByService: (serviceId: string) =>
    api.get(`/reviews/service/${serviceId}`),
  getMyReviews: () => api.get('/reviews/my'),
  respond: (id: string, response: string) =>
    api.patch(`/reviews/${id}/respond`, { response }),
};

export const messagesApi = {
  getConversations: () => api.get('/messages/conversations'),
  getConversation: (partnerId: string) =>
    api.get(`/messages/conversation/${partnerId}`),
  send: (data: { receiverId: string; content: string; bookingId?: string }) =>
    api.post('/messages', data),
  markAsRead: (id: string) => api.patch(`/messages/${id}/read`),
};

export const paymentsApi = {
  createIntent: (bookingId: string) =>
    api.post('/payments/create-intent', { bookingId }),
  confirm: (paymentIntentId: string) =>
    api.post(`/payments/confirm/${paymentIntentId}`),
};

export default api;
