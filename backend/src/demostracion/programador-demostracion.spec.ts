import { ProgramadorDemostracion } from './programador-demostracion';
import { DemostracionService } from './demostracion.service';

function construir() {
  const demostracion = {
    restaurar: vi.fn(async () => ({
      servicios: 0,
      perfiles: 0,
      valoraciones: 0,
      retirados: 0,
    })),
  };
  const programador = new ProgramadorDemostracion(
    demostracion as unknown as DemostracionService,
  );
  return { programador, demostracion };
}

describe('ProgramadorDemostracion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('restaura a los dos minutos de arrancar y después cada hora', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { programador, demostracion } = construir();

    programador.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(119_000);
    expect(demostracion.restaurar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(demostracion.restaurar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(demostracion.restaurar).toHaveBeenCalledTimes(2);

    programador.onModuleDestroy();
  });

  it('al apagarse deja de restaurar', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { programador, demostracion } = construir();

    programador.onApplicationBootstrap();
    programador.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

    expect(demostracion.restaurar).not.toHaveBeenCalled();
  });

  it('no arranca en las pruebas, ni con RESTAURAR_DEMOSTRACION=false', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const enPruebas = construir();
    enPruebas.programador.onApplicationBootstrap();

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESTAURAR_DEMOSTRACION', 'false');
    const apagado = construir();
    apagado.programador.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(enPruebas.demostracion.restaurar).not.toHaveBeenCalled();
    expect(apagado.demostracion.restaurar).not.toHaveBeenCalled();
  });

  it('una revisión que falla no lanza', async () => {
    const { programador, demostracion } = construir();
    demostracion.restaurar.mockRejectedValueOnce(new Error('sin base'));

    await expect(programador.restaurar()).resolves.toBeUndefined();
  });
});
