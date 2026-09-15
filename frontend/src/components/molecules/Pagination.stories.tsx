import type { Meta, StoryObj } from '@storybook/nextjs';
import Pagination from './Pagination';

const meta = {
  title: 'Molecules/Pagination',
  component: Pagination,
  args: { page: 1, totalPages: 5, onChange: () => {} },
} satisfies Meta<typeof Pagination>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const PocasPaginas: Historia = { name: 'Pocas páginas' };

// A partir de siete páginas el centro se recorta con puntos suspensivos para
// que la fila no desborde en móvil.
export const ConSalto: Historia = {
  name: 'Con salto',
  args: { page: 8, totalPages: 20 },
};

export const UltimaPagina: Historia = {
  name: 'Última página',
  args: { page: 5, totalPages: 5 },
};
