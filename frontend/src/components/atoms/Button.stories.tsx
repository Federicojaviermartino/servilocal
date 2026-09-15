import type { Meta, StoryObj } from '@storybook/nextjs';
import Button from './Button';

const meta = {
  title: 'Atoms/Button',
  component: Button,
  args: { children: 'Reservar ahora' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Primario: Historia = { args: { variant: 'primary' } };
export const Secundario: Historia = { args: { variant: 'secondary' } };
export const Fantasma: Historia = { args: { variant: 'ghost' } };
export const Peligro: Historia = {
  args: { variant: 'danger', children: 'Cancelar reserva' },
};

export const Tamanos: Historia = {
  name: 'Tamaños',
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm" />
      <Button {...args} size="md" />
      <Button {...args} size="lg" />
    </div>
  ),
};

export const Cargando: Historia = {
  args: { isLoading: true, children: 'Procesando el pago' },
};

export const Deshabilitado: Historia = { args: { disabled: true } };

export const AnchoCompleto: Historia = {
  name: 'Ancho completo',
  args: { fullWidth: true },
};
