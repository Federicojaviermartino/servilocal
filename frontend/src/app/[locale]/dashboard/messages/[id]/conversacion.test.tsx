import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../../messages/es.json';
import ConversationPage from './page';

const getConversation = vi.fn();

vi.mock('@/lib/api', () => ({
  messagesApi: {
    getConversation: (id: string) => getConversation(id),
    getConversations: async () => ({ data: [] }),
    send: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'u2' }) }));

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({ user: { id: 'u1' } }),
}));

// Sin socket: la conversación se refresca sola cada diez segundos.
vi.mock('@/lib/socket-mensajes', () => ({
  useMensajesEnVivo: () => ({ conectado: false }),
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});

const mensaje = {
  id: 'm1',
  senderId: 'u2',
  content: 'Hola, ¿mañana a las diez?',
  createdAt: '2026-09-24T09:00:00Z',
};

function pintar() {
  return render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <ConversationPage />
    </NextIntlClientProvider>,
  );
}

/** Deja que terminen las promesas pendientes y avanza los relojes falsos. */
const esperar = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  getConversation.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => vi.useRealTimers());

describe('Conversación', () => {
  it('si un refresco falla, lo que ya se veía se queda', async () => {
    // Antes el fallo vaciaba la conversación: un corte de un segundo en uno
    // de los refrescos hacía desaparecer todos los mensajes.
    getConversation
      .mockResolvedValueOnce({ data: [mensaje] })
      .mockRejectedValue({ code: 'ECONNABORTED' });
    pintar();
    await esperar();
    expect(screen.getByText(mensaje.content)).toBeInTheDocument();

    await esperar(10000);

    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(screen.getByText(mensaje.content)).toBeInTheDocument();
  });

  it('si la primera carga falla, lo dice y deja reintentar', async () => {
    // Antes enseñaba «no hay mensajes», que no es lo mismo que no haber
    // podido preguntar.
    getConversation
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: [mensaje] });
    pintar();
    await esperar();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(es.mensajesPanel.sinMensajes)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await esperar();

    expect(screen.getByText(mensaje.content)).toBeInTheDocument();
  });

  it('una sesión caducada se cuenta como tal', async () => {
    getConversation.mockRejectedValueOnce({ response: { status: 401 } });
    pintar();
    await esperar();

    expect(screen.getByRole('link', { name: /entrar/i })).toHaveAttribute(
      'href',
      '/auth/login',
    );
  });
});
