import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  const servicio = { metricas: vi.fn(), reputacion: vi.fn() };
  const controlador = new AdminController(servicio as never);

  beforeEach(() => vi.clearAllMocks());

  it('las métricas son las de la plataforma', async () => {
    await controlador.metricas();

    expect(servicio.metricas).toHaveBeenCalled();
  });

  it('la administración de demostración solo ve la reputación de su mundo', async () => {
    const quien = (soloLectura: boolean) =>
      ({ user: { id: 'u-1', soloLectura } }) as unknown as PeticionAutenticada;

    await controlador.reputacion(quien(true));
    await controlador.reputacion(quien(false));

    expect(servicio.reputacion).toHaveBeenNthCalledWith(1, {
      soloDemostracion: true,
    });
    expect(servicio.reputacion).toHaveBeenNthCalledWith(2, {
      soloDemostracion: false,
    });
  });
});
