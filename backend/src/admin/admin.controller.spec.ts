import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  const servicio = {
    metricas: vi.fn(),
    reputacion: vi.fn(),
    pagosPorRevisar: vi.fn(),
  };
  const controlador = new AdminController(servicio as never);

  beforeEach(() => vi.clearAllMocks());

  const quien = (soloLectura: boolean) =>
    ({ user: { id: 'u-1', soloLectura } }) as unknown as PeticionAutenticada;

  it('las métricas son las de la plataforma, y para la de demostración, las de su mundo', async () => {
    // Daban lo cobrado de verdad y cuántas cuentas reales hay a quien
    // entra con una contraseña que está en la pantalla de acceso.
    await controlador.metricas(quien(false));
    await controlador.metricas(quien(true));

    expect(servicio.metricas).toHaveBeenNthCalledWith(1, {
      soloDemostracion: false,
    });
    expect(servicio.metricas).toHaveBeenNthCalledWith(2, {
      soloDemostracion: true,
    });
  });

  it('y los pagos por revisar, igual: los de su mundo', async () => {
    await controlador.pagos(quien(true));
    await controlador.pagos(quien(false));

    expect(servicio.pagosPorRevisar).toHaveBeenNthCalledWith(1, {
      soloDemostracion: true,
    });
    expect(servicio.pagosPorRevisar).toHaveBeenNthCalledWith(2, {
      soloDemostracion: false,
    });
  });

  it('la administración de demostración solo ve la reputación de su mundo', async () => {
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
