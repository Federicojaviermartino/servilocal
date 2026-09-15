import type { Meta, StoryObj } from '@storybook/nextjs';
import { SERVICIO_EJEMPLO, otroServicio } from '../../../.storybook/datos';
import ServiceCard from './ServiceCard';

const meta = {
  title: 'Molecules/ServiceCard',
  component: ServiceCard,
  args: { service: SERVICIO_EJEMPLO },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ServiceCard>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const ConFoto: Historia = {
  name: 'Con foto',
  render: (args) => (
    <div className="max-w-sm">
      <ServiceCard {...args} />
    </div>
  ),
};

// Cuando el profesional no sube ninguna imagen se pinta el icono de la
// categoría sobre un fondo neutro, en lugar de un hueco vacío.
export const SinFoto: Historia = {
  name: 'Sin foto',
  args: { service: otroServicio('sin-foto', { images: [] }) },
  render: (args) => (
    <div className="max-w-sm">
      <ServiceCard {...args} />
    </div>
  ),
};

export const PrecioUnico: Historia = {
  name: 'Precio único',
  args: {
    service: otroServicio('precio-unico', {
      priceMax: undefined,
      priceMin: 35,
      priceUnit: 'por visita',
    }),
  },
  render: (args) => (
    <div className="max-w-sm">
      <ServiceCard {...args} />
    </div>
  ),
};

export const SinValoraciones: Historia = {
  name: 'Sin valoraciones',
  args: {
    service: otroServicio('sin-valoraciones', {
      averageRating: 0,
      totalReviews: 0,
    }),
  },
  render: (args) => (
    <div className="max-w-sm">
      <ServiceCard {...args} />
    </div>
  ),
};
