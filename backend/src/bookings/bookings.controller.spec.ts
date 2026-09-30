import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { BookingStatus, UserRole } from '../entities';
import { BookingsController } from './bookings.controller';

/**
 * Quién llama sale siempre de la sesión, nunca de la dirección ni del
 * cuerpo: si un controlador tomara el identificador de otro sitio, bastaría
 * con cambiarlo para actuar en nombre de otra persona. Las guardias de cada
 * ruta se prueban juntas en la integración (permisos.integracion.ts).
 */
describe('BookingsController', () => {
  const servicio = {
    create: vi.fn(),
    findByClient: vi.fn(),
    findByProvider: vi.fn(),
    verReserva: vi.fn(),
    updateStatus: vi.fn(),
  };
  const controlador = new BookingsController(servicio as never);
  const peticion = {
    user: { id: 'u-1', role: UserRole.CLIENT, soloLectura: false },
  } as unknown as PeticionAutenticada;

  beforeEach(() => vi.clearAllMocks());

  it('reserva a nombre de quien tiene la sesión', async () => {
    const datos = { serviceId: 's-1' } as never;

    await controlador.create(peticion, datos);

    expect(servicio.create).toHaveBeenCalledWith('u-1', datos);
  });

  it('lista las reservas propias, como cliente y como profesional', async () => {
    await controlador.findMyAsClient(peticion);
    await controlador.findMyAsProvider(peticion);

    expect(servicio.findByClient).toHaveBeenCalledWith('u-1');
    expect(servicio.findByProvider).toHaveBeenCalledWith('u-1');
  });

  it('una reserva se ve según quién la pide, con su rol y si solo lee', async () => {
    // verReserva decide qué datos de la otra parte se ven: necesita las tres.
    await controlador.findOne(peticion, 'r-1');

    expect(servicio.verReserva).toHaveBeenCalledWith('r-1', {
      id: 'u-1',
      role: UserRole.CLIENT,
      soloLectura: false,
    });
  });

  it('cambia el estado en nombre de quien llama y con su rol', async () => {
    const cambio = { status: BookingStatus.CANCELLED } as never;

    await controlador.updateStatus('r-1', peticion, cambio);

    expect(servicio.updateStatus).toHaveBeenCalledWith(
      'r-1',
      'u-1',
      UserRole.CLIENT,
      cambio,
    );
  });
});
