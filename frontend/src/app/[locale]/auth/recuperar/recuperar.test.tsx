import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import RecuperarPage from './page';
import RestablecerPage from '../restablecer/page';

const recuperar = vi.fn();
const restablecer = vi.fn();
const empujar = vi.fn();
const avisoExito = vi.fn();
let parametros = new URLSearchParams('token=' + 'x'.repeat(43));

vi.mock('@/lib/api', () => ({
  authApi: {
    recuperar: (...argumentos: unknown[]) => recuperar(...argumentos),
    restablecer: (...argumentos: unknown[]) => restablecer(...argumentos),
  },
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => parametros }));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: (m: string) => avisoExito(m),
    error: vi.fn(),
  }),
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
    useRouter: () => ({ push: empujar }),
  };
});

function pintar(pagina: React.ReactNode, idioma: 'es' | 'en' = 'es') {
  render(
    <NextIntlClientProvider
      locale={idioma}
      messages={(idioma === 'es' ? es : en) as never}
    >
      {pagina}
    </NextIntlClientProvider>,
  );
}

describe('Pedir el enlace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('manda el correo y el idioma, y responde lo mismo exista o no la cuenta', async () => {
    recuperar.mockResolvedValue({});
    pintar(<RecuperarPage />, 'en');

    await userEvent.type(
      screen.getByLabelText(en.acceso.email),
      'ana@ejemplo.org',
    );
    await userEvent.click(
      screen.getByRole('button', { name: en.acceso.recuperarEnviar }),
    );

    // En el idioma de la página: es el del correo.
    expect(recuperar).toHaveBeenCalledWith('ana@ejemplo.org', 'en');
    expect(await screen.findByRole('status')).toHaveTextContent(
      en.acceso.recuperarEnviado,
    );
  });

  it('sin correo configurado, lo dice en lugar de fingir que se envió', async () => {
    recuperar.mockRejectedValue({
      response: { status: 503, data: { codigo: 'correo-no-disponible' } },
    });
    pintar(<RecuperarPage />);

    await userEvent.type(
      screen.getByLabelText(es.acceso.email),
      'ana@ejemplo.org',
    );
    await userEvent.click(
      screen.getByRole('button', { name: es.acceso.recuperarEnviar }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      es.erroresApi['correo-no-disponible'],
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Elegir la contraseña nueva', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parametros = new URLSearchParams('token=' + 'x'.repeat(43));
  });

  const escribir = async (nueva: string, repetida = nueva) => {
    await userEvent.type(screen.getByLabelText(es.acceso.passwordNueva), nueva);
    await userEvent.type(screen.getByLabelText(es.acceso.confirmar), repetida);
    await userEvent.click(
      screen.getByRole('button', { name: es.acceso.restablecerGuardar }),
    );
  };

  it('la guarda con el token del enlace y lleva a iniciar sesión', async () => {
    // A iniciar sesión y no dentro: la API ha cerrado todas las sesiones.
    restablecer.mockResolvedValue({});
    pintar(<RestablecerPage />);

    await escribir('Nueva12345!');

    expect(restablecer).toHaveBeenCalledWith('x'.repeat(43), 'Nueva12345!');
    expect(avisoExito).toHaveBeenCalledWith(es.acceso.restablecida);
    expect(empujar).toHaveBeenCalledWith('/auth/login');
  });

  it('si no coinciden, no la manda', async () => {
    pintar(<RestablecerPage />);

    await escribir('Nueva12345!', 'Otra12345!');

    expect(screen.getByRole('alert')).toHaveTextContent(
      es.validacion.passwordsNoCoinciden,
    );
    expect(restablecer).not.toHaveBeenCalled();
  });

  it('un enlace caducado se explica, con cómo pedir otro', async () => {
    restablecer.mockRejectedValue({
      response: { status: 400, data: { codigo: 'enlace-no-valido' } },
    });
    pintar(<RestablecerPage />);

    await escribir('Nueva12345!');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      es.erroresApi['enlace-no-valido'],
    );
    expect(empujar).not.toHaveBeenCalled();
  });

  it('un enlace sin token no ofrece un formulario que no puede funcionar', () => {
    parametros = new URLSearchParams('');
    pintar(<RestablecerPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      es.acceso.enlaceIncompleto,
    );
    expect(
      screen.queryByRole('button', { name: es.acceso.restablecerGuardar }),
    ).toBeNull();
  });
});
