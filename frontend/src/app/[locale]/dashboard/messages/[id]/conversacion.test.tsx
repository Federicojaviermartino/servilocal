import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../../messages/es.json';
import ConversationPage from './page';

const getConversation = vi.fn();
const send = vi.fn();
const toastError = vi.fn();
const desplazar = vi.fn();

vi.mock('@/lib/api', () => ({
  messagesApi: {
    getConversation: (id: string) => getConversation(id),
    getConversations: async () => ({ data: [] }),
    send: (datos: unknown) => send(datos),
  },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'u2' }) }));

vi.mock('react-hot-toast', () => ({
  default: { error: (texto: string) => toastError(texto), success: vi.fn() },
}));

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
    usePathname: () => '/dashboard/messages/p1',
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
  send.mockReset();
  toastError.mockReset();
  desplazar.mockReset();
  // jsdom no desplaza nada: se anota a quién se le pide.
  Element.prototype.scrollTo = function (this: Element, opciones: unknown) {
    desplazar(this, opciones);
  } as typeof Element.prototype.scrollTo;
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

  it('baja hasta el último mensaje desplazando solo la lista', async () => {
    // Con scrollIntoView se desplazaba también la ventana, y al abrir una
    // conversación la cabecera y los primeros mensajes quedaban fuera.
    getConversation.mockResolvedValue({ data: [mensaje] });
    pintar();
    await esperar();

    const lista = screen.getByText(mensaje.content).closest('.overflow-y-auto');
    expect(desplazar).toHaveBeenLastCalledWith(
      lista,
      expect.objectContaining({ top: expect.any(Number) }),
    );
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
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

  describe('si el envío se rechaza', () => {
    // Sin avisar, el texto se quedaba en la caja y nada decía que no había
    // salido.
    async function enviar(rechazo: unknown) {
      getConversation.mockResolvedValue({ data: [mensaje] });
      send.mockRejectedValueOnce(rechazo);
      pintar();
      await esperar();

      fireEvent.change(
        screen.getByPlaceholderText(es.mensajesPanel.escribePlaceholder),
        { target: { value: 'Hola' } },
      );
      fireEvent.click(
        screen.getByRole('button', { name: es.mensajesPanel.enviar }),
      );
      await esperar();
    }

    it('lo dice', async () => {
      await enviar({ response: { status: 500, data: {} } });

      expect(toastError).toHaveBeenCalledWith(es.mensajesPanel.errorEnviar);
    });

    it('si se envían demasiados seguidos, lo dice', async () => {
      await enviar({ response: { status: 429, data: {} } });

      expect(toastError).toHaveBeenCalledWith(
        es.erroresApi['demasiadas-peticiones'],
      );
    });

    it('y si es entre una cuenta de demostración y una real, explica por qué', async () => {
      await enviar({
        response: { status: 403, data: { codigo: 'demostracion' } },
      });

      expect(toastError).toHaveBeenCalledWith(es.comun.demostracionAislada);
    });
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

  describe('con la sesión caducada al enviar', () => {
    afterEach(() => {
      sessionStorage.clear();
    });

    it('guarda lo escrito, y al volver lo recupera', async () => {
      getConversation.mockResolvedValue({ data: [mensaje] });
      send.mockRejectedValueOnce({ response: { status: 401, data: {} } });
      const { unmount } = pintar();
      await esperar();
      fireEvent.change(
        screen.getByPlaceholderText(es.mensajesPanel.escribePlaceholder),
        { target: { value: 'Mañana a las diez me va bien' } },
      );
      fireEvent.click(
        screen.getByRole('button', { name: es.mensajesPanel.enviar }),
      );
      await esperar();
      unmount();

      pintar();
      await esperar();

      expect(
        screen.getByPlaceholderText(es.mensajesPanel.escribePlaceholder),
      ).toHaveValue('Mañana a las diez me va bien');
    });
  });

  describe('lo que se escribe', () => {
    const conMensaje = async (content: string) => {
      getConversation.mockResolvedValue({ data: [{ ...mensaje, content }] });
      pintar();
      await esperar();
    };

    it('un mensaje en árabe toma su propia dirección', async () => {
      // Con la página en castellano, un texto en árabe se pintaba de
      // izquierda a derecha y la puntuación quedaba en el lado equivocado.
      await conMensaje('مرحبا، هل أنت متاح غدًا؟');

      expect(screen.getByText('مرحبا، هل أنت متاح غدًا؟')).toHaveAttribute(
        'dir',
        'auto',
      );
    });

    it('las marcas de HTML se enseñan como texto, no se interpretan', async () => {
      await conMensaje('<script>alert(1)</script> 🙂');

      expect(
        screen.getByText('<script>alert(1)</script> 🙂'),
      ).toBeInTheDocument();
      expect(document.querySelector('script')).toBeNull();
    });

    it('un texto largo sin espacios se parte, en vez de desbordar', async () => {
      await conMensaje('a'.repeat(2000));

      expect(screen.getByText('a'.repeat(2000))).toHaveClass('break-words');
    });

    it('la caja de escribir tiene nombre y el límite de la API', async () => {
      await conMensaje('Hola');

      const caja = screen.getByRole('textbox', {
        name: es.mensajesPanel.escribePlaceholder,
      });
      expect(caja).toHaveAttribute('maxlength', '2000');
      expect(caja).toHaveAttribute('dir', 'auto');
    });
  });
});
