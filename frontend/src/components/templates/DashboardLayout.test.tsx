import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import { useAuthStore } from '@/lib/auth-store';
import DashboardLayout from './DashboardLayout';

const empujar = vi.fn();
let rutaActual = '/dashboard';

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
    usePathname: () => rutaActual,
    useRouter: () => ({ push: empujar, replace: vi.fn() }),
  };
});

const pintar = () =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <DashboardLayout>
        <p>contenido</p>
      </DashboardLayout>
    </NextIntlClientProvider>,
  );

function entrarComo(role: 'client' | 'provider') {
  useAuthStore.setState({
    user: { id: 'u1', firstName: 'Laura', role } as never,
    isAuthenticated: true,
  });
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    rutaActual = '/dashboard';
    empujar.mockClear();
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('sin sesión guardada manda a entrar, con la vuelta apuntada', () => {
    // Sin el parámetro de retorno, quien entra acaba en la portada y tiene
    // que volver a buscar lo que iba a hacer.
    pintar();

    expect(empujar).toHaveBeenCalledWith('/auth/login?redirect=/dashboard');
  });

  it('mientras no hay usuario no se pinta el panel', () => {
    // Pintar el menú y quitarlo medio segundo después es peor que esperar.
    pintar();

    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });

  it('un cliente ve sus reservas y sus valoraciones', () => {
    entrarComo('client');

    pintar();

    expect(
      screen.getByRole('link', { name: es.reservasPanel.misReservas }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: es.panel.valoraciones }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: es.panel.misServicios }),
    ).not.toBeInTheDocument();
  });

  it('un profesional ve sus servicios y las reservas recibidas', () => {
    entrarComo('provider');

    pintar();

    expect(
      screen.getByRole('link', { name: es.panel.misServicios }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: es.reservasPanel.reservasRecibidas }),
    ).toBeInTheDocument();
  });

  it('el contenido de la página se pinta dentro', () => {
    entrarComo('client');

    pintar();

    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('la sección actual se marca como tal', () => {
    // Sin marcarla, el menú no dice dónde se está.
    rutaActual = '/dashboard/profile';
    entrarComo('client');

    pintar();

    expect(screen.getByRole('link', { name: es.panel.perfil })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('el resumen no se marca al estar en una subsección', () => {
    // «/dashboard» es prefijo de todas las demás: sin excluirlo, el resumen
    // aparecería siempre activo y habría dos secciones marcadas a la vez.
    rutaActual = '/dashboard/profile';
    entrarComo('client');

    pintar();

    expect(
      screen.getByRole('link', { name: es.panel.resumen }),
    ).not.toHaveAttribute('aria-current');
  });
});
