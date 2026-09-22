import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import { useAuthStore } from '@/lib/auth-store';
import Footer from './Footer';
import Header from './Header';

const reemplazar = vi.fn();

vi.mock('@/lib/socket-mensajes', () => ({
  useAvisosEnVivo: () => ({ conectado: false }),
  useMensajesEnVivo: () => ({ conectado: false }),
}));

vi.mock('@/lib/api', () => ({
  avisosApi: {
    listar: async () => ({ data: [] }),
    sinLeer: async () => ({ data: { total: 0 } }),
    marcarLeido: async () => ({ data: null }),
    marcarTodos: async () => ({ data: null }),
  },
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({
      href,
      children,
      ...resto
    }: {
      href: string;
      children: React.ReactNode;
    }) => React.createElement('a', { href, ...resto }, children),
    usePathname: () => '/',
    useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
  };
});

const pintar = (nodo: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      {nodo}
    </NextIntlClientProvider>,
  );

/** Deja la sesión como si acabara de entrar esa persona. */
function entrarComo(role: 'client' | 'provider' | 'admin') {
  useAuthStore.setState({
    user: {
      id: 'u1',
      firstName: 'Laura',
      lastName: 'Gil',
      email: 'laura@ejemplo.com',
      role,
    } as never,
    token: 'jwt',
    isAuthenticated: true,
  });
}

describe('Header', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('sin sesión ofrece entrar y registrarse', () => {
    pintar(<Header />);

    expect(
      screen.getAllByRole('link', { name: es.navegacion.iniciarSesion }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', { name: es.navegacion.registrarse }).length,
    ).toBeGreaterThan(0);
  });

  it('sin sesión no hay campana de avisos', () => {
    // No hay a quién avisar, y pedir los avisos daría un 401 en cada visita.
    pintar(<Header />);

    expect(
      screen.queryByRole('button', { name: new RegExp(es.avisos.titulo, 'i') }),
    ).not.toBeInTheDocument();
  });

  it('un cliente ve sus reservas, no las recibidas', () => {
    entrarComo('client');

    pintar(<Header />);

    expect(
      screen.getAllByRole('link', { name: es.navegacion.misReservas }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('link', { name: es.navegacion.reservasRecibidas }),
    ).not.toBeInTheDocument();
  });

  it('un profesional ve las recibidas', () => {
    entrarComo('provider');

    pintar(<Header />);

    expect(
      screen.getAllByRole('link', { name: es.navegacion.reservasRecibidas })
        .length,
    ).toBeGreaterThan(0);
  });

  it('solo administración ve el enlace al panel', () => {
    // Enseñarlo a los demás llevaría a una página que rebota al panel
    // propio, que es peor que no ofrecerlo.
    entrarComo('client');
    const { unmount } = pintar(<Header />);
    expect(
      screen.queryByRole('link', { name: es.navegacion.administracion }),
    ).not.toBeInTheDocument();
    unmount();

    entrarComo('admin');
    pintar(<Header />);
    expect(
      screen.getAllByRole('link', { name: es.navegacion.administracion })
        .length,
    ).toBeGreaterThan(0);
  });

  it('con sesión aparece la campana de avisos', () => {
    entrarComo('client');

    pintar(<Header />);

    expect(
      screen.getAllByRole('button', {
        name: new RegExp(es.avisos.abrir, 'i'),
      }).length,
    ).toBeGreaterThan(0);
  });

  it('el menú de móvil se abre y se cierra', async () => {
    pintar(<Header />);

    await userEvent.click(
      screen.getByRole('button', { name: es.navegacion.abrirMenu }),
    );
    expect(
      screen.getByRole('navigation', { name: es.navegacion.menuMovil }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: es.navegacion.cerrarMenu }),
    );
    expect(
      screen.queryByRole('navigation', { name: es.navegacion.menuMovil }),
    ).not.toBeInTheDocument();
  });

  it('el menú de móvil lleva las mismas secciones privadas', async () => {
    // En un marketplace la mayoría entra desde el teléfono: lo que falte
    // aquí, falta para casi todo el mundo.
    entrarComo('client');
    pintar(<Header />);

    await userEvent.click(
      screen.getByRole('button', { name: es.navegacion.abrirMenu }),
    );

    const menu = screen.getByRole('navigation', {
      name: es.navegacion.menuMovil,
    });
    expect(
      within(menu).getByRole('link', { name: es.navegacion.misReservas }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('link', { name: es.navegacion.mensajes }),
    ).toBeInTheDocument();
  });

  it('salir deja la sesión cerrada', async () => {
    entrarComo('client');
    pintar(<Header />);

    await userEvent.click(
      screen.getAllByRole('button', {
        name: es.navegacion.cerrarSesion,
      })[0],
    );

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('Footer', () => {
  it('se anuncia como pie de página', () => {
    pintar(<Footer />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('lleva a los textos legales, que son obligatorios', () => {
    pintar(<Footer />);

    expect(screen.getByRole('link', { name: es.pie.terminos })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(
      screen.getByRole('link', { name: es.pie.privacidad }),
    ).toHaveAttribute('href', '/privacy');
  });
});
