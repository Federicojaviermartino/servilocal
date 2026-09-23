import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OrigenGuard } from './origen.guard';

/**
 * El recorrido completo, con la aplicación escuchando, está en
 * auth.controller.spec.ts. Aquí van los casos sueltos.
 */
function contexto(
  peticion: { method: string; headers: Record<string, string> },
  tipo = 'http',
): ExecutionContext {
  return {
    getType: () => tipo,
    switchToHttp: () => ({ getRequest: () => peticion }),
  } as unknown as ExecutionContext;
}

const guardia = new OrigenGuard();

beforeEach(() =>
  vi.stubEnv('CORS_ORIGINS', 'https://servilocal-web.onrender.com'),
);
afterEach(() => vi.unstubAllEnvs());

describe('OrigenGuard', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rechaza %s desde otra web',
    (method) => {
      expect(() =>
        guardia.canActivate(
          contexto({ method, headers: { origin: 'https://ajena.example' } }),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it('deja pasar al frontend', () => {
    expect(
      guardia.canActivate(
        contexto({
          method: 'DELETE',
          headers: { origin: 'https://servilocal-web.onrender.com' },
        }),
      ),
    ).toBe(true);
  });

  it('no confunde un dominio que solo empieza igual', () => {
    expect(() =>
      guardia.canActivate(
        contexto({
          method: 'POST',
          headers: {
            origin: 'https://servilocal-web.onrender.com.ajena.example',
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('un sitio ajeno no se cuela diciendo same-site', () => {
    // same-site no es same-origin: en onrender.com, cualquier otra
    // aplicación del mismo proveedor sería «del mismo sitio» si no fuera
    // un sufijo público. Solo vale el mismo origen exacto.
    expect(() =>
      guardia.canActivate(
        contexto({
          method: 'POST',
          headers: {
            origin: 'https://ajena.example',
            'sec-fetch-site': 'same-site',
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('no se mete en los sockets', () => {
    expect(
      guardia.canActivate(
        contexto(
          { method: 'POST', headers: { origin: 'https://ajena.example' } },
          'ws',
        ),
      ),
    ).toBe(true);
  });
});
