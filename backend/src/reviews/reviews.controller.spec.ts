import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { ReviewsController } from './reviews.controller';

/**
 * Quién valora, responde, denuncia o modera sale de la sesión: ver
 * bookings.controller.spec.ts.
 */
describe('ReviewsController', () => {
  const servicio = {
    findByService: vi.fn(),
    findByClient: vi.fn(),
    findReported: vi.fn(),
    create: vi.fn(),
    addProviderResponse: vi.fn(),
    reportReview: vi.fn(),
    dismissReport: vi.fn(),
    deleteReview: vi.fn(),
  };
  const controlador = new ReviewsController(servicio as never);
  const peticion = (soloLectura = false) =>
    ({
      user: { id: 'u-1', email: 'ana@correo.test', soloLectura },
    }) as unknown as PeticionAutenticada;

  beforeEach(() => vi.clearAllMocks());

  it('las de un servicio se leen sin sesión', async () => {
    await controlador.findByService('s-1');

    expect(servicio.findByService).toHaveBeenCalledWith('s-1');
  });

  it('valora, responde y denuncia como quien tiene la sesión', async () => {
    const valoracion = { bookingId: 'r-1', rating: 5 } as never;
    const respuesta = { response: 'Gracias' } as never;
    const denuncia = { reason: 'Insulta' } as never;

    await controlador.findMine(peticion());
    await controlador.create(peticion(), valoracion);
    await controlador.addResponse('v-1', peticion(), respuesta);
    await controlador.report(peticion(), 'v-1', denuncia);

    expect(servicio.findByClient).toHaveBeenCalledWith('u-1');
    expect(servicio.create).toHaveBeenCalledWith('u-1', valoracion);
    expect(servicio.addProviderResponse).toHaveBeenCalledWith(
      'v-1',
      'u-1',
      respuesta,
    );
    // Con la cuenta entera: denunciar solo vale dentro del mismo mundo.
    expect(servicio.reportReview).toHaveBeenCalledWith(
      'v-1',
      denuncia,
      peticion().user,
    );
  });

  it('la administración de demostración solo ve las denuncias de su mundo', async () => {
    await controlador.findReported(peticion(true));
    await controlador.findReported(peticion(false));

    expect(servicio.findReported).toHaveBeenNthCalledWith(1, {
      soloDemostracion: true,
    });
    expect(servicio.findReported).toHaveBeenNthCalledWith(2, {
      soloDemostracion: false,
    });
  });

  it('moderar queda a nombre de quien modera', async () => {
    await controlador.dismissReport(peticion(), 'v-1');
    const borrado = await controlador.remove(peticion(), 'v-2');

    const quien = { id: 'u-1', email: 'ana@correo.test' };
    expect(servicio.dismissReport).toHaveBeenCalledWith('v-1', quien);
    expect(servicio.deleteReview).toHaveBeenCalledWith('v-2', quien);
    expect(borrado).toEqual({ message: expect.any(String) });
  });
});
