import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../entities';

/**
 * RolesGuard es el control que impide que un cliente alcance las rutas de
 * administración. Es pequeño y sin dependencias externas, así que merece la
 * pena cubrirlo entero.
 */
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const contextoCon = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const exigirRoles = (roles: UserRole[] | undefined) =>
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  it('deja pasar cuando la ruta no exige ningún rol', () => {
    exigirRoles(undefined);
    expect(guard.canActivate(contextoCon({ role: UserRole.CLIENT }))).toBe(
      true,
    );
  });

  it('deja pasar cuando la lista de roles exigidos está vacía', () => {
    exigirRoles([]);
    expect(guard.canActivate(contextoCon({ role: UserRole.CLIENT }))).toBe(
      true,
    );
  });

  it('deja pasar cuando el usuario tiene el rol exigido', () => {
    exigirRoles([UserRole.ADMIN]);
    expect(guard.canActivate(contextoCon({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('bloquea cuando el usuario tiene otro rol', () => {
    exigirRoles([UserRole.ADMIN]);
    expect(guard.canActivate(contextoCon({ role: UserRole.CLIENT }))).toBe(
      false,
    );
  });

  it('acepta cualquiera de los roles cuando se exigen varios', () => {
    exigirRoles([UserRole.ADMIN, UserRole.PROVIDER]);
    expect(guard.canActivate(contextoCon({ role: UserRole.PROVIDER }))).toBe(
      true,
    );
  });

  it('bloquea cuando no hay usuario en la petición', () => {
    // Ocurriría si el guardia se usara sin AuthGuard delante. Debe denegar,
    // no reventar con un error de servidor.
    exigirRoles([UserRole.ADMIN]);
    expect(guard.canActivate(contextoCon(undefined))).toBe(false);
  });
});
