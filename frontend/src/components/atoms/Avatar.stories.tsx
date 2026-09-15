import type { Meta, StoryObj } from '@storybook/nextjs';
import Avatar from './Avatar';

const meta = {
  title: 'Atoms/Avatar',
  component: Avatar,
  args: { name: 'Laura Fernández' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const ConIniciales: Historia = {
  name: 'Con iniciales',
  render: (args) => (
    <div className="flex items-center gap-3">
      <Avatar {...args} size="sm" />
      <Avatar {...args} size="md" />
      <Avatar {...args} size="lg" />
    </div>
  ),
};

export const ConFoto: Historia = {
  name: 'Con foto',
  args: {
    size: 'lg',
    src: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
  },
};
