import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import RegisterPage from './page';

const registrar = vi.fn();
const empujar = vi.fn();

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({ register: registrar, isLoading: false }),
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
    useRouter: () => ({ push: empujar }),
  };
});

async function rellenar() {
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <RegisterPage />
    </NextIntlClientProvider>,
  );
  await userEvent.type(screen.getByLabelText(es.acceso.nombre), 'Ana');
  await userEvent.type(screen.getByLabelText(es.acceso.apellidos), 'Ruiz');
  await userEvent.type(
    screen.getByLabelText(es.acceso.email),
    'ana@ejemplo.org',
  );
  await userEvent.type(
    screen.getByLabelText(es.acceso.password, { selector: 'input' }),
    'Clave12345!',
  );
  await userEvent.type(
    screen.getByLabelText(es.acceso.confirmar),
    'Clave12345!',
  );
}

const crear = () =>
  userEvent.click(screen.getByRole('button', { name: es.acceso.crear }));

describe('El registro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registrar.mockResolvedValue(undefined);
  });

  it('sin aceptar los términos no se crea la cuenta, y dice por qué', async () => {
    // Los términos exigen la mayoría de edad y el registro no pedía nada.
    await rellenar();

    await crear();

    expect(await screen.findByText(es.acceso.debesAceptar)).toBeVisible();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('aceptándolos, la API recibe la casilla marcada', async () => {
    await rellenar();
    await userEvent.click(screen.getByRole('checkbox'));

    await crear();

    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ana@ejemplo.org',
          aceptaTerminos: true,
        }),
      ),
    );
    // Y la confirmación no viaja: no la necesita nadie más que el formulario.
    expect(registrar.mock.calls[0][0]).not.toHaveProperty('confirmPassword');
  });

  it('los términos y la política se abren aparte, sin perder lo escrito', async () => {
    await rellenar();

    const terminos = screen.getByRole('link', { name: 'términos de uso' });
    const privacidad = screen.getByRole('link', {
      name: 'política de privacidad',
    });
    expect(terminos).toHaveAttribute('href', '/terms');
    expect(terminos).toHaveAttribute('target', '_blank');
    expect(privacidad).toHaveAttribute('href', '/privacy');
  });
});
