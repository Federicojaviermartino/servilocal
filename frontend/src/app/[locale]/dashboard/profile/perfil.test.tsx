import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import ProfilePage from './page';

const getMe = vi.fn();
const getById = vi.fn();
const cambiarContrasena = vi.fn();
const exportarDatos = vi.fn();
const eliminarCuenta = vi.fn();
const salir = vi.fn(async () => undefined);
const empujar = vi.fn();
const avisoExito = vi.fn();
const avisoError = vi.fn();

vi.mock('@/lib/api', () => ({
  usersApi: {
    getMe: () => getMe(),
    getById: (id: string) => getById(id),
    updateProfile: vi.fn(),
    exportarDatos: () => exportarDatos(),
    eliminarCuenta: (contrasena: string) => eliminarCuenta(contrasena),
  },
  authApi: {
    cambiarContrasena: (actual: string, nueva: string) =>
      cambiarContrasena(actual, nueva),
  },
}));

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({
    user: { id: 'u1', email: 'ana@ejemplo.org', role: 'client' },
    logout: salir,
  }),
}));

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: empujar }) }));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: (m: string) => avisoExito(m),
    error: (m: string) => avisoError(m),
  }),
}));

const PERFIL = {
  firstName: 'Ana',
  lastName: 'Ruiz',
  phone: null,
  bio: null,
  address: null,
  city: 'Málaga',
  postalCode: null,
};

async function pintar(perfil: object = PERFIL) {
  getMe.mockResolvedValue({ data: perfil });
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <ProfilePage />
    </NextIntlClientProvider>,
  );
  await screen.findByDisplayValue('Ana');
}

describe('Mi perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se carga con /users/me: /users/:id es de administración', async () => {
    // Con /users/:id, a clientes y profesionales les respondía 403 y el
    // perfil no llegaba a cargar.
    await pintar();

    expect(getMe).toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();
  });

  describe('la contraseña', () => {
    const cambiar = async (actual: string, nueva: string, repetida = nueva) => {
      await userEvent.type(
        screen.getByLabelText(es.perfilPanel.contrasenaActual),
        actual,
      );
      await userEvent.type(
        screen.getByLabelText(es.perfilPanel.contrasenaNueva),
        nueva,
      );
      await userEvent.type(
        screen.getByLabelText(es.perfilPanel.contrasenaRepetir),
        repetida,
      );
      await userEvent.click(
        screen.getByRole('button', { name: es.perfilPanel.cambiarContrasena }),
      );
    };

    it('se cambia con la actual, y avisa de que cerró las demás sesiones', async () => {
      cambiarContrasena.mockResolvedValue({});
      await pintar();

      await cambiar('Antigua123!', 'Nueva12345!');

      expect(cambiarContrasena).toHaveBeenCalledWith(
        'Antigua123!',
        'Nueva12345!',
      );
      await waitFor(() =>
        expect(avisoExito).toHaveBeenCalledWith(
          es.perfilPanel.contrasenaCambiada,
        ),
      );
    });

    it('si la nueva no coincide, no la manda', async () => {
      await pintar();

      await cambiar('Antigua123!', 'Nueva12345!', 'Otra12345!');

      expect(screen.getByRole('alert')).toHaveTextContent(
        es.validacion.passwordsNoCoinciden,
      );
      expect(cambiarContrasena).not.toHaveBeenCalled();
    });

    it('con la actual equivocada, lo dice sin echarle de la sesión', async () => {
      cambiarContrasena.mockRejectedValue({
        response: { status: 400, data: { codigo: 'contrasena-incorrecta' } },
      });
      await pintar();

      await cambiar('NoEsEsta1!', 'Nueva12345!');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.erroresApi['contrasena-incorrecta'],
      );
      expect(salir).not.toHaveBeenCalled();
    });
  });

  describe('los datos', () => {
    it('se descargan en un fichero', async () => {
      const crear = vi.fn(() => 'blob:datos');
      Object.assign(URL, { createObjectURL: crear, revokeObjectURL: vi.fn() });
      const pulsar = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      exportarDatos.mockResolvedValue({ data: new Blob(['{}']) });
      await pintar();

      await userEvent.click(
        screen.getByRole('button', { name: es.perfilPanel.descargarDatos }),
      );

      await waitFor(() => expect(pulsar).toHaveBeenCalled());
      expect(crear).toHaveBeenCalled();
      pulsar.mockRestore();
    });
  });

  describe('eliminar la cuenta', () => {
    const eliminar = async () => {
      await userEvent.type(
        screen.getByLabelText(es.perfilPanel.eliminarContrasena),
        'Clave12345!',
      );
      await userEvent.click(
        screen.getByRole('button', { name: es.perfilPanel.eliminarBoton }),
      );
    };

    it('pide confirmación, y sin ella no hace nada', async () => {
      const preguntar = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await pintar();

      await eliminar();

      expect(preguntar).toHaveBeenCalledWith(es.perfilPanel.eliminarPregunta);
      expect(eliminarCuenta).not.toHaveBeenCalled();
      preguntar.mockRestore();
    });

    it('confirmada, la elimina con la contraseña, cierra la sesión y sale', async () => {
      const preguntar = vi.spyOn(window, 'confirm').mockReturnValue(true);
      eliminarCuenta.mockResolvedValue({});
      await pintar();

      await eliminar();

      await waitFor(() => expect(empujar).toHaveBeenCalledWith('/'));
      expect(eliminarCuenta).toHaveBeenCalledWith('Clave12345!');
      expect(salir).toHaveBeenCalled();
      expect(avisoExito).toHaveBeenCalledWith(es.perfilPanel.cuentaEliminada);
      preguntar.mockRestore();
    });

    it('con reservas abiertas, explica qué hacer antes', async () => {
      const preguntar = vi.spyOn(window, 'confirm').mockReturnValue(true);
      eliminarCuenta.mockRejectedValue({
        response: {
          status: 409,
          data: { codigo: 'cuenta-con-reservas-abiertas' },
        },
      });
      await pintar();

      await eliminar();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.erroresApi['cuenta-con-reservas-abiertas'],
      );
      expect(salir).not.toHaveBeenCalled();
      preguntar.mockRestore();
    });
  });

  it('una cuenta de demostración no ofrece cambiar la contraseña ni eliminarla', async () => {
    // Las comparten todos los visitantes; la API lo rechazaría igual.
    await pintar({ ...PERFIL, esDemostracion: true });

    expect(
      screen.getByText(es.perfilPanel.demostracionSinGestion),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: es.perfilPanel.cambiarContrasena }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: es.perfilPanel.eliminarBoton }),
    ).toBeNull();
    // Descargar sus datos, sí.
    expect(
      screen.getByRole('button', { name: es.perfilPanel.descargarDatos }),
    ).toBeVisible();
  });
});
