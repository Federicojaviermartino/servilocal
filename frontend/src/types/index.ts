export enum UserRole {
  CLIENT = 'client',
  PROVIDER = 'provider',
  ADMIN = 'admin',
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  parentId?: string;
  children?: Category[];
  isActive: boolean;
  sortOrder: number;
}

export interface Service {
  id: string;
  providerId: string;
  provider: User;
  categoryId: string;
  category: Category;
  title: string;
  description: string;
  priceMin: number;
  priceMax?: number;
  priceUnit: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
  coverageRadiusKm: number;
  images: string[];
  averageRating: number;
  totalReviews: number;
  isActive: boolean;
  createdAt: string;
}

export interface ServiceSearchParams {
  query?: string;
  categoryId?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  minRating?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

export interface Booking {
  id: string;
  clientId: string;
  client: User;
  serviceId: string;
  service: Service;
  providerId: string;
  provider: User;
  status: BookingStatus;
  scheduledDate: string;
  description?: string;
  totalPrice: number;
  createdAt: string;
}

export interface CreateBookingDto {
  serviceId: string;
  scheduledDate: string;
  description?: string;
  totalPrice: number;
}

export interface Review {
  id: string;
  bookingId: string;
  clientId: string;
  client: User;
  serviceId: string;
  rating: number;
  comment?: string;
  providerResponse?: string;
  createdAt: string;
}

export interface CreateReviewDto {
  bookingId: string;
  serviceId: string;
  rating: number;
  comment?: string;
}

export interface Message {
  id: string;
  senderId: string;
  sender: User;
  receiverId: string;
  receiver: User;
  bookingId?: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  partnerId: string;
  partner: User;
  lastMessage: Message;
  unreadCount: number;
}

export interface PaymentIntent {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}
