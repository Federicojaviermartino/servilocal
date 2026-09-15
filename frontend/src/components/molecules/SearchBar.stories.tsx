import type { Meta, StoryObj } from '@storybook/nextjs';
import SearchBar from './SearchBar';

const meta = {
  title: 'Molecules/SearchBar',
  component: SearchBar,
  args: { onSearch: () => {} },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SearchBar>;

export default meta;
type Historia = StoryObj<typeof meta>;

// El texto de ayuda sale del catálogo: cambiando el idioma en la barra se ve
// traducido, y en árabe el icono salta al otro lado.
export const Vacio: Historia = { name: 'Vacío' };

export const ConBusqueda: Historia = {
  name: 'Con búsqueda previa',
  args: { initialValue: 'fontanero' },
};
