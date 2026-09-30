import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import LoginPage from './page';

const entrar = vi.fn();
const reemplazar = vi.fn();
let parametros = new URLSearchParams();

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({ login: entrar, isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => parametros,
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    // Como el de next-intl: la dirección puede venir como objeto.
    Link: ({
      href,
      children,
    }: {
      href: string | { pathname: string; query?: Record<string, string> };
      children: React.ReactNode;
    }) =>
      React.createElement(
        'a',
        {
          href:
            typeof href === 'string'
              ? href
              : `${href.pathname}?${new URLSearchParams(href.query)}`,
        },
        children,
      ),
    useRouter: () => ({ replace: reemplazar }),
  };
});

async function iniciarSesion() {
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <LoginPage />
    </NextIntlClientProvider>,
  );
  await userEvent.type(
    screen.getByLabelText(es.acceso.email),
    'ana@ejemplo.org',
  );
  await userEvent.type(
    screen.getByLabelText(es.acceso.password, { selector: 'input' }),
    'Clave12345!',
  );
  await userEvent.click(screen.getByRole('button', { name: es.acceso.entrar }));
}

describe('El acceso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parametros = new URLSearchParams();
    entrar.mockResolvedValue(undefined);
  });

  describe('adónde lleva al entrar', () => {
    it('a la página de la que venía', async () => {
      parametros = new URLSearchParams({ redirect: '/services/s1/book' });

      await iniciarSesion();

      await waitFor(() =>
        expect(reemplazar).toHaveBeenCalledWith('/services/s1/book'),
      );
    });

    it('nunca fuera de la aplicación', async () => {
      // Un enlace con «redirect=https://…» llevaba a quien acababa de entrar
      // a una página ajena que podía pedirle la contraseña otra vez.
      parametros = new URLSearchParams({
        redirect: 'https://servi1ocal.example/relogin',
      });

      await iniciarSesion();

      await waitFor(() => expect(reemplazar).toHaveBeenCalledWith('/'));
    });
  });

  describe('si no entra, dice por qué en su idioma', () => {
    it.each([
      ['credenciales-no-validas', 401],
      ['cuenta-desactivada', 401],
    ] as const)('%s', async (codigo, status) => {
      entrar.mockRejectedValue({ response: { status, data: { codigo } } });

      await iniciarSesion();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.erroresApi[codigo],
      );
    });

    it('demasiados intentos seguidos', async () => {
      // Antes salía «ThrottlerException: Too Many Requests».
      entrar.mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'ThrottlerException: Too Many Requests' },
        },
      });

      await iniciarSesion();

      const aviso = await screen.findByRole('alert');
      expect(aviso).toHaveTextContent(es.erroresApi['demasiadas-peticiones']);
      expect(aviso).not.toHaveTextContent('Throttler');
    });

    it('un fallo del servidor, sin el mensaje de la API', async () => {
      entrar.mockRejectedValue({
        response: { status: 500, data: { message: 'Internal server error' } },
      });

      await iniciarSesion();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.acceso.errorServicio,
      );
    });

    it('sin red', async () => {
      entrar.mockRejectedValue({ code: 'ERR_NETWORK' });

      await iniciarSesion();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.acceso.errorRed,
      );
    });
  });

  describe('el enlace para registrarse', () => {
    it('conserva el destino, si lo había', () => {
      parametros = new URLSearchParams({ redirect: '/services/s1/book' });
      render(
        <NextIntlClientProvider locale="es" messages={es as never}>
          <LoginPage />
        </NextIntlClientProvider>,
      );

      expect(
        screen.getByRole('link', { name: es.acceso.registrateAqui }),
      ).toHaveAttribute(
        'href',
        '/auth/register?redirect=%2Fservices%2Fs1%2Fbook',
      );
    });

    it('sin destino, el registro a secas', () => {
      render(
        <NextIntlClientProvider locale="es" messages={es as never}>
          <LoginPage />
        </NextIntlClientProvider>,
      );

      expect(
        screen.getByRole('link', { name: es.acceso.registrateAqui }),
      ).toHaveAttribute('href', '/auth/register');
    });
  });
});
