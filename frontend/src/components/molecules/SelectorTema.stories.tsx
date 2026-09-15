import type { Meta, StoryObj } from '@storybook/nextjs';
import SelectorTema from './SelectorTema';

const meta = {
  title: 'Molecules/SelectorTema',
  component: SelectorTema,
} satisfies Meta<typeof SelectorTema>;

export default meta;
type Historia = StoryObj<typeof meta>;

// El botón lee la clase del documento al montarse, así que refleja el tema
// elegido en la barra de herramientas.
export const Alternador: Historia = {};
