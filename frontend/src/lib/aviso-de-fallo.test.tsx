import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../messages/es.json';
import { useAvisoDeFallo } from './aviso-de-fallo';

const avisoError = vi.fn();
const descartar = vi.fn();

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    error: (...argumentos: unknown[]) => avisoError(...argumentos),
    dismiss: (id: string) => descartar(id),
  }),
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    usePathname: () => '/services/s1/book',
    Link: ({
      href,
      children,
      onClick,
    }: {
      href: { pathname: string; query: Record<string, string> };
      children: ReactNode;
      onClick?: () => void;
    }) =>
      React.createElement(
        'a',
        {
          href: `${href.pathname}?${new URLSearchParams(href.query)}`,
          onClick,
        },
        children,
      ),
  };
});

const guardar = vi.fn();

/** Una pantalla mínima que falla al enviar con el error que se le dé. */
function Pantalla({ error }: { error: unknown }) {
  const avisar = useAvisoDeFallo();
  return (
    <button onClick={() => avisar(error, 'No se ha podido guardar', guardar)}>
      Enviar
    </button>
  );
}

const conIdiomas = (hijo: ReactNode) => (
  <NextIntlClientProvider locale="es" messages={es as never}>
    {hijo}
  </NextIntlClientProvider>
);

async function fallarCon(error: unknown) {
  render(conIdiomas(<Pantalla error={error} />));
  await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
}

describe('useAvisoDeFallo', () => {
  beforeEach(() => {
    avisoError.mockClear();
    descartar.mockClear();
    guardar.mockClear();
  });

  it('con la sesión caducada, guarda lo escrito y ofrece volver a entrar a la misma página', async () => {
    // Un «no se ha podido guardar» invitaba a reintentar, y reintentar
    // fallaba igual; para entrar había que salir y perder lo escrito.
    await fallarCon({ response: { status: 401, data: {} } });

    expect(guardar).toHaveBeenCalledTimes(1);
    const [contenido, opciones] = avisoError.mock.calls[0] as [
      (aviso: { id: string }) => ReactNode,
      { id: string },
    ];
    // Uno solo aunque fallen varias cosas a la vez.
    expect(opciones.id).toBe('sesion-caducada');

    render(conIdiomas(contenido({ id: 'aviso-1' })));
    expect(
      screen.getByText(es.erroresApi['sesion-caducada']),
    ).toBeInTheDocument();
    const enlace = screen.getByRole('link', { name: es.carga.entrarDeNuevo });
    expect(enlace).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Fservices%2Fs1%2Fbook',
    );

    await userEvent.click(enlace);
    expect(descartar).toHaveBeenCalledWith('aviso-1');
  });

  it('un rechazo con código se explica en el idioma, sin guardar nada', async () => {
    await fallarCon({ response: { status: 409, data: { codigo: 'solape' } } });

    expect(avisoError).toHaveBeenCalledWith(es.erroresApi.solape);
    expect(guardar).not.toHaveBeenCalled();
  });

  it('entre una cuenta de demostración y una real, explica por qué', async () => {
    await fallarCon({
      response: { status: 403, data: { codigo: 'demostracion' } },
    });

    expect(avisoError).toHaveBeenCalledWith(es.comun.demostracionAislada);
  });

  it('cualquier otro fallo, con la frase de la pantalla', async () => {
    await fallarCon({ response: { status: 500, data: {} } });

    expect(avisoError).toHaveBeenCalledWith('No se ha podido guardar');
  });
});
