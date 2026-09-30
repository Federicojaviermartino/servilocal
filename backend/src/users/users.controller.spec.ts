import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  const servicio = {
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    exportarDatos: vi.fn(),
    eliminarCuenta: vi.fn(),
    toggleActive: vi.fn(),
  };
  const controlador = new UsersController(servicio as never);
  const peticion = (soloLectura = false) =>
    ({
      user: { id: 'u-1', email: 'ana@correo.test', soloLectura },
    }) as unknown as PeticionAutenticada;
  const respuesta = () =>
    ({ setHeader: vi.fn(), clearCookie: vi.fn() }) as unknown as Response & {
      setHeader: ReturnType<typeof vi.fn>;
      clearCookie: ReturnType<typeof vi.fn>;
    };
  const cuenta = (esDemostracion = false) => ({
    id: 'u-2',
    email: 'otra@correo.test',
    password: '$2b$10$hash',
    esDemostracion,
  });

  beforeEach(() => vi.clearAllMocks());

  it('el perfil propio es el de la sesión, y sin la contraseña', async () => {
    servicio.findById.mockResolvedValueOnce(cuenta());
    servicio.update.mockResolvedValueOnce(cuenta());
    const cambios = { firstName: 'Ana' } as never;

    const leido = await controlador.findMe(peticion());
    const cambiado = await controlador.updateProfile(peticion(), cambios);

    expect(servicio.findById).toHaveBeenCalledWith('u-1');
    expect(servicio.update).toHaveBeenCalledWith('u-1', cambios);
    expect(leido).not.toHaveProperty('password');
    expect(cambiado).not.toHaveProperty('password');
  });

  it('exporta los datos propios como descarga fechada', async () => {
    const salida = respuesta();

    await controlador.exportar(peticion(), salida);

    expect(servicio.exportarDatos).toHaveBeenCalledWith('u-1');
    expect(salida.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="servilocal-mis-datos-\d{4}-\d{2}-\d{2}\.json"$/,
      ),
    );
  });

  it('eliminar la cuenta propia cierra también la sesión', async () => {
    const salida = respuesta();

    await controlador.eliminar(peticion(), { contrasena: 'Clave1234' }, salida);

    expect(servicio.eliminarCuenta).toHaveBeenCalledWith('u-1', 'Clave1234');
    expect(salida.clearCookie).toHaveBeenCalled();
  });

  it('si no se elimina, la sesión sigue abierta', async () => {
    servicio.eliminarCuenta.mockRejectedValueOnce(new Error('contraseña'));
    const salida = respuesta();

    await expect(
      controlador.eliminar(peticion(), { contrasena: 'mala' }, salida),
    ).rejects.toThrow();
    expect(salida.clearCookie).not.toHaveBeenCalled();
  });

  describe('la administración', () => {
    it('ve una cuenta sin su contraseña', async () => {
      servicio.findById.mockResolvedValueOnce(cuenta());

      const vista = await controlador.findOne(peticion(), 'u-2');

      expect(vista).toMatchObject({ id: 'u-2' });
      expect(vista).not.toHaveProperty('password');
    });

    it('la de demostración no ve las cuentas reales, ni sabe que existen', async () => {
      servicio.findById.mockResolvedValueOnce(cuenta(false));

      await expect(controlador.findOne(peticion(true), 'u-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('la de demostración sí ve las de su mundo', async () => {
      servicio.findById.mockResolvedValueOnce(cuenta(true));

      await expect(
        controlador.findOne(peticion(true), 'u-2'),
      ).resolves.toMatchObject({ id: 'u-2' });
    });

    it('la lista se limita a la demostración para su administración', async () => {
      await controlador.findAll(peticion(true));
      await controlador.findAll(peticion(false));

      expect(servicio.findAll).toHaveBeenNthCalledWith(1, {
        soloDemostracion: true,
      });
      expect(servicio.findAll).toHaveBeenNthCalledWith(2, {
        soloDemostracion: false,
      });
    });

    it('desactivar queda a nombre de quien lo hace', async () => {
      await controlador.toggleActive(peticion(), 'u-2');

      expect(servicio.toggleActive).toHaveBeenCalledWith('u-2', {
        id: 'u-1',
        email: 'ana@correo.test',
      });
    });
  });
});
