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

  it('con un correo ya registrado, lo dice en su idioma, no con el mensaje de la API', async () => {
    // Una usuaria alemana veía «Ya existe un usuario con este email».
    registrar.mockRejectedValue({
      response: {
        status: 409,
        data: {
          codigo: 'correo-en-uso',
          message: 'Ya existe un usuario con este email',
        },
      },
    });
    await rellenar();
    await userEvent.click(screen.getByRole('checkbox'));

    await crear();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      es.erroresApi['correo-en-uso'],
    );
  });

  it('un rechazo sin código no pega los mensajes de la API', async () => {
    registrar.mockRejectedValue({
      response: { status: 400, data: { message: ['email must be an email'] } },
    });
    await rellenar();
    await userEvent.click(screen.getByRole('checkbox'));

    await crear();

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(es.acceso.errorCrear);
    expect(aviso).not.toHaveTextContent('must be');
  });

  it('cada error está asociado a su campo, para que el lector diga por qué', async () => {
    render(
      <NextIntlClientProvider locale="es" messages={es as never}>
        <RegisterPage />
      </NextIntlClientProvider>,
    );

    await crear();

    const nombre = screen.getByLabelText(es.acceso.nombre);
    expect(nombre).toHaveAttribute('aria-invalid', 'true');
    expect(nombre).toHaveAccessibleDescription(es.validacion.obligatorio);
    expect(screen.getByLabelText(es.acceso.email)).toHaveAccessibleDescription(
      es.validacion.emailObligatorio,
    );
  });

  it('un nombre demasiado largo dice por qué no se envía', async () => {
    // Con más de cien caracteres el formulario no se enviaba y no aparecía
    // ningún texto.
    await rellenar();
    await userEvent.type(
      screen.getByLabelText(es.acceso.nombre),
      'a'.repeat(100),
    );
    await userEvent.click(screen.getByRole('checkbox'));

    await crear();

    expect(
      await screen.findByText(
        es.validacion.maximoCaracteres.replace('{max}', '100'),
      ),
    ).toBeVisible();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('un correo sin dominio completo se corrige aquí, no en la API', async () => {
    render(
      <NextIntlClientProvider locale="es" messages={es as never}>
        <RegisterPage />
      </NextIntlClientProvider>,
    );
    await userEvent.type(
      screen.getByLabelText(es.acceso.email),
      'ana@correo.c',
    );

    await crear();

    expect(await screen.findByText(es.validacion.emailInvalido)).toBeVisible();
  });
});
