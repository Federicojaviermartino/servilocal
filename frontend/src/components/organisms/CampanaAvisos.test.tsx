import { act, render, screen, waitFor } from '@testing-library/react';
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

// El socket no se abre en una prueba, pero sí se guarda el manejador que
// registra el componente, para poder entregarle avisos como si llegaran por
// él. Antes se sustituía por uno que no entregaba nada, y el anuncio de los
// avisos en vivo no lo había probado nunca nadie.
const socket = vi.hoisted(() => ({
  entregar: null as null | ((aviso: unknown) => void),
}));
vi.mock('@/lib/socket-mensajes', () => ({
  useAvisosEnVivo: (manejador: (aviso: unknown) => void) => {
    socket.entregar = manejador;
    return { conectado: false };
  },
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

describe('CampanaAvisos, avisos en vivo', () => {
  beforeEach(() => {
    listar.mockReset();
    listar.mockResolvedValue({ data: [] });
    socket.entregar = null;
  });

  /** La región que lee el lector de pantalla y que no se ve. */
  const anuncio = () =>
    document.querySelector('[aria-live="polite"]')?.textContent ?? '';

  async function pintarYEsperar() {
    pintar();
    await waitFor(() => expect(listar).toHaveBeenCalled());
    await waitFor(() => expect(socket.entregar).not.toBeNull());
  }

  it('un aviso que llega se anuncia a quien usa lector de pantalla', async () => {
    // Sin el anuncio, la llegada solo se nota en un número rojo de diez
    // píxeles sobre la campana.
    await pintarYEsperar();

    act(() => socket.entregar!(aviso({ id: 'n1', type: 'booking_confirmed' })));

    expect(anuncio()).toBe(es.avisos.booking_confirmed);
  });

  it('si llegan dos seguidos, se anuncia el segundo', async () => {
    // El componente decidía si un aviso era nuevo poniendo una variable a
    // true dentro de la función que actualiza el estado, y leyéndola justo
    // después. Eso solo funciona si React ejecuta esa función en el acto, y
    // no lo hace cuando ya hay una actualización pendiente: con dos avisos
    // en el mismo lote, el segundo no se anunciaba.
    await pintarYEsperar();

    act(() => {
      socket.entregar!(aviso({ id: 'n1', type: 'booking_confirmed' }));
      socket.entregar!(aviso({ id: 'n2', type: 'booking_cancelled' }));
    });

    expect(anuncio()).toBe(es.avisos.booking_cancelled);
  });

  it('un aviso repetido no se vuelve a anunciar', async () => {
    // El socket puede entregar el mismo aviso dos veces al reconectarse.
    await pintarYEsperar();

    act(() => socket.entregar!(aviso({ id: 'n1', type: 'booking_confirmed' })));
    act(() => socket.entregar!(aviso({ id: 'n2', type: 'booking_cancelled' })));
    act(() => socket.entregar!(aviso({ id: 'n1', type: 'booking_confirmed' })));

    expect(anuncio()).toBe(es.avisos.booking_cancelled);
  });

  it('ni uno que ya venía en la lista inicial', async () => {
    listar.mockResolvedValue({
      data: [aviso({ id: 'viejo', type: 'booking_request' })],
    });
    await pintarYEsperar();
    // El panel está cerrado, así que la lista no se pinta: lo que dice que ya
    // cargó es el botón.
    await screen.findByRole('button', {
      name: es.avisos.abrirConPendientes.replace('{total}', '1'),
    });

    act(() =>
      socket.entregar!(aviso({ id: 'viejo', type: 'booking_request' })),
    );

    expect(anuncio()).toBe('');
  });
});
