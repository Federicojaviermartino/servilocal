import type { Meta, StoryObj } from '@storybook/nextjs';
import RatingStars from './RatingStars';

const meta = {
  title: 'Molecules/RatingStars',
  component: RatingStars,
  args: { rating: 4 },
} satisfies Meta<typeof RatingStars>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const ConNumero: Historia = {
  name: 'Con número y total',
  args: { rating: 4.7, total: 23, showNumber: true },
};

export const Interactiva: Historia = {
  args: { rating: 0, interactive: true, size: 'lg' },
};

export const SinValoraciones: Historia = {
  name: 'Sin valoraciones',
  args: { rating: 0, total: 0, showNumber: true },
};
