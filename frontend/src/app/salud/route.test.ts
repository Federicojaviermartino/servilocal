import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());

describe('/salud', () => {
  it('dice qué commit está sirviendo', async () => {
    // La prueba de humo espera a verlo antes de probar nada: sin él daría
    // por bueno un despliegue que todavía no ha llegado.
    vi.stubEnv('RENDER_GIT_COMMIT', 'b3934a0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a');

    const respuesta = GET();

    expect(await respuesta.json()).toEqual({
      estado: 'ok',
      version: 'b3934a0',
    });
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
  });

  it('fuera de Render no se inventa una versión', async () => {
    vi.stubEnv('RENDER_GIT_COMMIT', '');

    expect((await GET().json()).version).toBeNull();
  });
});
