import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import de from '../../../messages/de.json';

const listar = vi.fn();
vi.mock('@/lib/api', () => ({
  avisosApi: {
    listar: () => listar(),
    marcarLeido: vi.fn(async () => undefined),
    marcarTodos: vi.fn(async () => undefined),
  },
}));

// El socket no se abre en una prueba: lo que se comprueba aquí es qué pinta
// el componente con lo que ya tiene, no el transporte.
vi.mock('@/lib/socket-mensajes', () => ({
  useAvisosEnVivo: () => ({ conectado: false }),
}));

import CampanaAvisos from './CampanaAvisos';

function aviso(extra: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    type: 'booking_confirmed',
    content: '{}',
    actionUrl: '/dashboard/bookings/b1',
    isRead: false,
    createdAt: '2026-09-18T10:00:00.000Z',
    ...extra,
  };
}

function pintar(mensajes: unknown = es, locale = 'es') {
  return render(
    <NextIntlClientProvider locale={locale} messages={mensajes as never}>
      <CampanaAvisos />
    </NextIntlClientProvider>,
  );
}

describe('CampanaAvisos', () => {
  beforeEach(() => {
    listar.mockReset();
  });

  it('cuenta solo los que están sin leer', async () => {
    listar.mockResolvedValue({
      data: [aviso(), aviso({ id: 'a2' }), aviso({ id: 'a3', isRead: true })],
    });

    pintar();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /2 sin leer/ }),
      ).toBeInTheDocument(),
    );
  });

  it('sin pendientes no anuncia ninguno', async () => {
    listar.mockResolvedValue({ data: [aviso({ isRead: true })] });

    pintar();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Abrir los avisos' }),
      ).toBeInTheDocument(),
    );
  });

  it('compone la frase con el catálogo del visitante', async () => {
    // El servidor guarda el tipo, no el texto: el mismo aviso se lee en el
    // idioma de quien lo abre, aunque se creara con otro puesto.
    listar.mockResolvedValue({ data: [aviso()] });

    const { unmount } = pintar();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /1 sin leer/ })).toBeVisible(),
    );
    screen.getByRole('button', { name: /1 sin leer/ }).click();
    await waitFor(() =>
      expect(screen.getByText('Tu reserva ha sido confirmada.')).toBeVisible(),
    );
    unmount();

    pintar(de, 'de');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /1 ungelesen/ }),
      ).toBeInTheDocument(),
    );
  });

  it('interpola los datos que vienen del servidor', async () => {
    listar.mockResolvedValue({
      data: [aviso({ type: 'new_review', content: '{"nota":"4"}' })],
    });

    pintar();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /1 sin leer/ })).toBeVisible(),
    );
    screen.getByRole('button', { name: /1 sin leer/ }).click();

    await waitFor(() =>
      expect(
        screen.getByText('Has recibido una valoración de 4 estrellas.'),
      ).toBeVisible(),
    );
  });

  it('un tipo desconocido se lee, no enseña la clave', async () => {
    listar.mockResolvedValue({ data: [aviso({ type: 'cosa_que_no_existe' })] });

    pintar();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /1 sin leer/ })).toBeVisible(),
    );
    screen.getByRole('button', { name: /1 sin leer/ }).click();

    await waitFor(() => {
      expect(screen.getByText('Tienes un aviso nuevo.')).toBeVisible();
      expect(screen.queryByText('cosa_que_no_existe')).not.toBeInTheDocument();
    });
  });

  it('un contenido corrupto no rompe el panel', async () => {
    listar.mockResolvedValue({ data: [aviso({ content: 'esto no es json' })] });

    pintar();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /1 sin leer/ })).toBeVisible(),
    );
    screen.getByRole('button', { name: /1 sin leer/ }).click();

    await waitFor(() =>
      expect(screen.getByText('Tu reserva ha sido confirmada.')).toBeVisible(),
    );
  });

  it('si la petición falla, la campana sigue ahí y vacía', async () => {
    listar.mockRejectedValue(new Error('sin red'));

    pintar();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Abrir los avisos' }),
      ).toBeInTheDocument(),
    );
  });
});
