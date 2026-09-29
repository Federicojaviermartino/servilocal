import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { User } from '../../entities';
import type { SesionesService } from '../sesiones.service';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

interface Cuenta {
  id: string;
  isActive: boolean;
  sesionesDesde?: Date | null;
}

/**
 * Un repositorio que filtra de verdad por lo que se le pide.
 *
 * El doble que montaba esta estrategia en otras pruebas devolvía siempre una
 * cuenta activa, pidiera lo que pidiera: quitar «isActive: true» de la
 * consulta no rompía nada, y una cuenta desactivada por moderación habría
 * seguido entrando con su cookie hasta que caducara.
 */
function construir(cuentas: Cuenta[], revocadas: string[] = []) {
  const usuarios = {
    findOne: vi.fn(
      async ({ where }: { where: { id: string; isActive?: boolean } }) =>
        cuentas.find(
          (c) =>
            c.id === where.id &&
            (where.isActive === undefined || c.isActive === where.isActive),
        ) ?? null,
    ),
  };
  const sesiones = {
    estaRevocada: vi.fn(async (jti: string) => revocadas.includes(jti)),
  };
  const configuracion = { getOrThrow: () => 'secreto_de_prueba' };
  return new JwtStrategy(
    configuracion as unknown as ConfigService,
    usuarios as unknown as Repository<User>,
    sesiones as unknown as SesionesService,
  );
}

const ahora = () => Math.floor(Date.now() / 1000);
const pase = (extra: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'u1',
  email: 'ana@ejemplo.org',
  role: 'client',
  jti: 'sesion-1',
  iat: ahora(),
  ...extra,
});

const rechazo = (promesa: Promise<unknown>) =>
  expect(promesa).rejects.toThrow(UnauthorizedException);

describe('JwtStrategy', () => {
  it('una cuenta activa con una sesión viva entra', async () => {
    const estrategia = construir([{ id: 'u1', isActive: true }]);

    await expect(estrategia.validate(pase())).resolves.toMatchObject({
      id: 'u1',
    });
  });

  it('una cuenta desactivada pierde el acceso, aunque su token siga firmado', async () => {
    const estrategia = construir([{ id: 'u1', isActive: false }]);

    await rechazo(estrategia.validate(pase()));
  });

  it('una cuenta que ya no existe, tampoco entra', async () => {
    await rechazo(construir([]).validate(pase()));
  });

  it('una sesión cerrada no vale, aunque la cuenta siga activa', async () => {
    const estrategia = construir([{ id: 'u1', isActive: true }], ['sesion-1']);

    await rechazo(estrategia.validate(pase()));
  });

  it('un token sin identificador de sesión no se acepta: no se podría cerrar', async () => {
    const estrategia = construir([{ id: 'u1', isActive: true }]);

    await rechazo(estrategia.validate(pase({ jti: undefined })));
  });

  describe('tras cambiar la contraseña', () => {
    const cambio = new Date(Date.now() - 60_000);

    it('un token de antes del cambio ya no vale', async () => {
      const estrategia = construir([
        { id: 'u1', isActive: true, sesionesDesde: cambio },
      ]);

      await rechazo(
        estrategia.validate(
          pase({ iat: Math.floor(cambio.getTime() / 1000) - 10 }),
        ),
      );
    });

    it('uno de después, sí', async () => {
      const estrategia = construir([
        { id: 'u1', isActive: true, sesionesDesde: cambio },
      ]);

      await expect(estrategia.validate(pase())).resolves.toMatchObject({
        id: 'u1',
      });
    });
  });
});
