import type { Service } from '../src/types';

/**
 * Datos de ejemplo para las fichas. Se mantienen aquí y no en src para que no
 * viajen al paquete de la aplicación.
 */
export const SERVICIO_EJEMPLO: Service = {
  id: '7f3c1e28-0b4a-4d8e-9f21-5c6d8a1b2e34',
  providerId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
  provider: {
    id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
    email: 'carlos@ejemplo.com',
    firstName: 'Carlos',
    lastName: 'Ruiz',
    role: 'provider',
    city: 'Madrid',
    isActive: true,
    createdAt: '2026-01-12T09:00:00.000Z',
  } as Service['provider'],
  categoryId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  category: {
    id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
    name: 'Fontanería',
    slug: 'fontaneria',
    icon: '🔧',
  } as Service['category'],
  title: 'Reparación de fugas y sustitución de grifería',
  description:
    'Localizo fugas sin obra, cambio grifos y sifones y reviso la instalación completa. Presupuesto cerrado antes de empezar y garantía de seis meses.',
  priceMin: 45,
  priceMax: 120,
  priceUnit: 'por hora',
  address: 'Calle de Alcalá 120',
  city: 'Madrid',
  coverageRadiusKm: 15,
  images: [
    'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=800&q=80',
  ],
  averageRating: 4.7,
  totalReviews: 23,
  isActive: true,
  createdAt: '2026-02-03T11:30:00.000Z',
} as Service;

export const otroServicio = (
  id: string,
  cambios: Partial<Service>,
): Service => ({ ...SERVICIO_EJEMPLO, id, ...cambios });
