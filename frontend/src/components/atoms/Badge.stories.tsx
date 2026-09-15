import type { Meta, StoryObj } from '@storybook/nextjs';
import Badge from './Badge';

const meta = {
  title: 'Atoms/Badge',
  component: Badge,
  args: { children: 'Pendiente' },
} satisfies Meta<typeof Badge>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Estados: Historia = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="warning">Pendiente</Badge>
      <Badge variant="info">Confirmada</Badge>
      <Badge variant="success">Completada</Badge>
      <Badge variant="default">Cancelada</Badge>
      <Badge variant="danger">Rechazada</Badge>
    </div>
  ),
};

export const Categoria: Historia = {
  name: 'Categoría',
  args: { variant: 'info', children: 'Fontanería' },
};
