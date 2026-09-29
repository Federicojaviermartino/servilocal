import { ProgramadorCaducidad } from './programador-caducidad';
import { BookingsService } from './bookings.service';

function construir() {
  const reservas = { caducarPendientes: vi.fn(async () => 0) };
  const programador = new ProgramadorCaducidad(
    reservas as unknown as BookingsService,
  );
  return { programador, reservas };
}

describe('ProgramadorCaducidad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('mira al minuto y medio de arrancar y después cada hora', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { programador, reservas } = construir();

    programador.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(89_000);
    expect(reservas.caducarPendientes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reservas.caducarPendientes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(reservas.caducarPendientes).toHaveBeenCalledTimes(2);

    programador.onModuleDestroy();
  });

  it('al apagarse deja de mirar', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { programador, reservas } = construir();

    programador.onApplicationBootstrap();
    programador.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

    expect(reservas.caducarPendientes).not.toHaveBeenCalled();
  });

  it('no arranca en las pruebas, ni con RETENCIONES_AUTOMATICAS=false', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const enPruebas = construir();
    enPruebas.programador.onApplicationBootstrap();

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RETENCIONES_AUTOMATICAS', 'false');
    const apagado = construir();
    apagado.programador.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(enPruebas.reservas.caducarPendientes).not.toHaveBeenCalled();
    expect(apagado.reservas.caducarPendientes).not.toHaveBeenCalled();
  });

  it('una revisión que falla no lanza', async () => {
    const { programador, reservas } = construir();
    reservas.caducarPendientes.mockRejectedValueOnce(new Error('sin base'));

    await expect(programador.caducar()).resolves.toBeUndefined();
  });
});
