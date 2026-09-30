import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import RatingStars from './RatingStars';

function pintar(props: ComponentProps<typeof RatingStars>) {
  return render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <p id="etiqueta">Valoración mínima</p>
      <RatingStars {...props} />
    </NextIntlClientProvider>,
  );
}

describe('RatingStars', () => {
  describe('para enseñar una nota', () => {
    it('dice la nota, y no son botones', () => {
      // Eran cinco «Valorar» deshabilitados por reseña, y la nota solo se
      // veía por el color.
      pintar({ rating: 4.5 });

      expect(
        screen.getByRole('img', { name: '4,5 de 5 estrellas' }),
      ).toBeInTheDocument();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('con el número y el total, los dice también', () => {
      pintar({ rating: 4, total: 3, showNumber: true });

      expect(
        screen.getByRole('img', { name: '4,0 de 5 estrellas, 3 valoraciones' }),
      ).toBeInTheDocument();
    });

    it('una sola valoración va en singular', () => {
      pintar({ rating: 5, total: 1, showNumber: true });

      expect(
        screen.getByRole('img', { name: '5,0 de 5 estrellas, 1 valoración' }),
      ).toBeInTheDocument();
    });
  });

  describe('para elegir', () => {
    it('es un grupo de radios con el nombre de su etiqueta', () => {
      pintar({
        rating: 3,
        interactive: true,
        onChange: vi.fn(),
        idEtiqueta: 'etiqueta',
      });

      const grupo = screen.getByRole('radiogroup', {
        name: 'Valoración mínima',
      });
      expect(grupo).toBeInTheDocument();
      expect(screen.getAllByRole('radio')).toHaveLength(5);
      expect(
        screen.getByRole('radio', { name: '1 estrella' }),
      ).not.toBeChecked();
    });

    it('anuncia la que está marcada', () => {
      // Al valorar, no se sabía que ya había estrellas marcadas.
      pintar({ rating: 3, interactive: true, onChange: vi.fn() });

      expect(screen.getByRole('radio', { name: '3 estrellas' })).toBeChecked();
    });

    it('elegir una avisa con su valor', async () => {
      const onChange = vi.fn();
      pintar({ rating: 0, interactive: true, onChange });

      await userEvent.click(screen.getByRole('radio', { name: '4 estrellas' }));

      expect(onChange).toHaveBeenCalledWith(4);
    });

    it('se recorre con las flechas, como cualquier grupo de radios', async () => {
      const onChange = vi.fn();
      pintar({ rating: 2, interactive: true, onChange });

      screen.getByRole('radio', { name: '2 estrellas' }).focus();
      await userEvent.keyboard('{ArrowRight}');

      expect(onChange).toHaveBeenCalledWith(3);
    });

    it('si se permite, también se puede no marcar ninguna', async () => {
      const onChange = vi.fn();
      pintar({ rating: 4, interactive: true, onChange, ninguna: 'Cualquiera' });

      await userEvent.click(screen.getByRole('radio', { name: 'Cualquiera' }));

      expect(onChange).toHaveBeenCalledWith(0);
      expect(screen.getAllByRole('radio')).toHaveLength(6);
    });
  });
});
