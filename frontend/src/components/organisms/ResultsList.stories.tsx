import type { Meta, StoryObj } from '@storybook/nextjs';
import { SERVICIO_EJEMPLO, otroServicio } from '../../../.storybook/datos';
import ResultsList from './ResultsList';

const meta = {
  title: 'Organisms/ResultsList',
  component: ResultsList,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ResultsList>;

export default meta;
type Historia = StoryObj<typeof meta>;

const VARIOS = [
  SERVICIO_EJEMPLO,
  otroServicio('electricidad', {
    title: 'Instalación eléctrica y cuadros de protección',
    category: { ...SERVICIO_EJEMPLO.category, name: 'Electricidad' },
    priceMin: 50,
    priceMax: 90,
    city: 'Barcelona',
    averageRating: 4.9,
    totalReviews: 41,
    images: [],
  }),
  otroServicio('clases', {
    title: 'Clases particulares de matemáticas',
    category: { ...SERVICIO_EJEMPLO.category, name: 'Clases particulares' },
    priceMin: 20,
    priceMax: undefined,
    priceUnit: 'por hora',
    city: 'Valencia',
    averageRating: 4.5,
    totalReviews: 12,
    images: [],
  }),
];

// El recuento usa plurales ICU: cambiando el idioma en la barra se ve cómo se
// resuelve en lenguas con más de dos formas, como el árabe.
export const ConResultados: Historia = {
  name: 'Con resultados',
  args: { services: VARIOS, total: VARIOS.length },
};

export const UnSoloResultado: Historia = {
  name: 'Un solo resultado',
  args: { services: [SERVICIO_EJEMPLO], total: 1 },
};

// Solo se pinta cuando la búsqueda ha respondido bien, así que una lista vacía
// significa cero resultados y nunca un fallo de red.
export const SinResultados: Historia = {
  name: 'Sin resultados',
  args: { services: [], total: 0 },
};
