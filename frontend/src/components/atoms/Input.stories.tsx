import type { Meta, StoryObj } from '@storybook/nextjs';
import Input from './Input';

const meta = {
  title: 'Atoms/Input',
  component: Input,
  args: { label: 'Correo electrónico', placeholder: 'tu@email.com' },
} satisfies Meta<typeof Input>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const Basico: Historia = { name: 'Básico' };

export const ConPista: Historia = {
  name: 'Con pista',
  args: {
    label: 'Precio acordado en euros',
    type: 'number',
    defaultValue: 60,
    hint: 'Este importe puede ajustarse tras hablar con el profesional.',
  },
};

// El mensaje de error se asocia al campo con aria-describedby, de modo que un
// lector de pantalla lo anuncia al enfocarlo.
export const ConError: Historia = {
  name: 'Con error',
  args: { error: 'Introduce un email válido', defaultValue: 'correo-malo' },
};

export const Deshabilitado: Historia = { args: { disabled: true } };
