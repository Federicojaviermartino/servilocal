import { ProgramadorRetenciones } from './programador-retenciones';
import { PaymentsService } from './payments.service';

function construir() {
  const pagos = {
    revisarRetenciones: vi.fn(async () => ({
      renovada: 0,
      perdida: 0,
      conciliada: 0,
      nada: 0,
    })),
  };
  const programador = new ProgramadorRetenciones(
    pagos as unknown as PaymentsService,
  );
  return { programador, pagos };
}

describe('ProgramadorRetenciones', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('revisa al minuto de arrancar y después cada hora', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { programador, pagos } = construir();

    programador.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(pagos.revisarRetenciones).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(pagos.revisarRetenciones).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(pagos.revisarRetenciones).toHaveBeenCalledTimes(2);

    programador.onModuleDestroy();
  });

  it('al apagarse deja de revisar', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { programador, pagos } = construir();

    programador.onApplicationBootstrap();
    programador.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

    expect(pagos.revisarRetenciones).not.toHaveBeenCalled();
  });

  it('no arranca en las pruebas', async () => {
    // Si arrancara, cada prueba que levanta la aplicación dejaría un
    // temporizador llamando a Stripe con una clave de mentira.
    vi.stubEnv('NODE_ENV', 'test');
    const { programador, pagos } = construir();

    programador.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);

    expect(pagos.revisarRetenciones).not.toHaveBeenCalled();
  });

  it('se apaga con RETENCIONES_AUTOMATICAS=false', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RETENCIONES_AUTOMATICAS', 'false');
    const { programador, pagos } = construir();

    programador.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);

    expect(pagos.revisarRetenciones).not.toHaveBeenCalled();
  });

  it('una revisión que falla no lanza', async () => {
    const { programador, pagos } = construir();
    pagos.revisarRetenciones.mockRejectedValueOnce(new Error('sin base'));

    await expect(programador.revisar()).resolves.toBeUndefined();
  });
});
