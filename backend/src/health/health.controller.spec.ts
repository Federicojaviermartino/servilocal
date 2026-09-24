import { ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { HealthController } from './health.controller';

function construir(baseResponde = true) {
  const dataSource = {
    query: vi.fn(async () => {
      if (!baseResponde) throw new Error('sin conexión');
      return [{ '?column?': 1 }];
    }),
  };
  return new HealthController(dataSource as never);
}

const peticion = (headers: Record<string, string> = {}) =>
  ({ headers }) as unknown as Request;

const SECRETO = 's'.repeat(32);

afterEach(() => vi.unstubAllEnvs());

describe('HealthController', () => {
  it('con la base respondiendo, todo en orden', async () => {
    const informe = await construir().comprobar(peticion());

    expect(informe).toMatchObject({ estado: 'ok', baseDeDatos: 'ok' });
  });

  it('sin base de datos contesta con error, no con un 200 que diga degradado', async () => {
    // Un monitor mira el código, no el texto: un 200 con «degradado»
    // dentro no lo detectaría nadie.
    await expect(construir(false).comprobar(peticion())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('dice qué commit está sirviendo', async () => {
    // La prueba de humo espera a verlo para saber que el despliegue nuevo
    // ya atiende, y no el anterior.
    vi.stubEnv('RENDER_GIT_COMMIT', '9e66daeb3ca1c45ae566ad833ede4a0bd7c663e0');

    const informe = await construir().comprobar(peticion());

    expect(informe.version).toBe('9e66dae');
  });

  it('sin Render delante no se inventa una versión', async () => {
    vi.stubEnv('RENDER_GIT_COMMIT', '');

    const informe = await construir().comprobar(peticion());

    expect(informe.version).toBeNull();
  });

  it('a través del frontend y con el secreto bueno, lo reconoce', async () => {
    vi.stubEnv('PROXY_SECRETO', SECRETO);

    const informe = await construir().comprobar(
      peticion({ 'x-proxy-secreto': SECRETO, 'x-visitante-ip': '1.2.3.4' }),
    );

    expect(informe.atravesDelFrontend).toBe(true);
  });

  it('con otro secreto, o llamada directa, no', async () => {
    vi.stubEnv('PROXY_SECRETO', SECRETO);

    const conOtro = await construir().comprobar(
      peticion({
        'x-proxy-secreto': 'x'.repeat(32),
        'x-visitante-ip': '1.2.3.4',
      }),
    );
    const directa = await construir().comprobar(peticion());

    expect(conOtro.atravesDelFrontend).toBe(false);
    expect(directa.atravesDelFrontend).toBe(false);
  });

  it('no enseña ni el secreto ni la dirección del visitante', async () => {
    vi.stubEnv('PROXY_SECRETO', SECRETO);

    const informe = await construir().comprobar(
      peticion({ 'x-proxy-secreto': SECRETO, 'x-visitante-ip': '1.2.3.4' }),
    );

    expect(JSON.stringify(informe)).not.toContain(SECRETO);
    expect(JSON.stringify(informe)).not.toContain('1.2.3.4');
  });
});
