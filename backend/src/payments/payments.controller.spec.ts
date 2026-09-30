import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { UserRole } from '../entities';
import { PaymentsController } from './payments.controller';

/**
 * Quién paga, cobra o reembolsa sale de la sesión: ver
 * bookings.controller.spec.ts.
 */
describe('PaymentsController', () => {
  const servicio = {
    createPaymentIntent: vi.fn(),
    confirmPaymentHold: vi.fn(),
    capturePayment: vi.fn(),
    refundPayment: vi.fn(),
    findByClient: vi.fn(),
    findByBooking: vi.fn(),
  };
  const controlador = new PaymentsController(servicio as never);
  const peticion = {
    user: {
      id: 'u-1',
      email: 'ana@correo.test',
      role: UserRole.ADMIN,
      soloLectura: true,
    },
  } as unknown as PeticionAutenticada;

  beforeEach(() => vi.clearAllMocks());

  it('el pago se prepara para la reserva del cuerpo, a nombre de la sesión', async () => {
    await controlador.createIntent(peticion, { bookingId: 'r-1' });

    expect(servicio.createPaymentIntent).toHaveBeenCalledWith('u-1', 'r-1');
  });

  it('la retención se confirma comprobando quién la confirma', async () => {
    await controlador.confirmHold(peticion, 'pi_123');

    expect(servicio.confirmPaymentHold).toHaveBeenCalledWith('pi_123', 'u-1');
  });

  it('cobrar y reembolsar quedan a nombre de quien lo hace, para el historial', async () => {
    await controlador.capture(peticion, 'r-1');
    await controlador.refund(peticion, 'r-2');

    const quien = { id: 'u-1', email: 'ana@correo.test' };
    expect(servicio.capturePayment).toHaveBeenCalledWith('r-1', quien);
    expect(servicio.refundPayment).toHaveBeenCalledWith('r-2', quien);
  });

  it('los pagos propios y los de una reserva, según quién los pide', async () => {
    await controlador.findMy(peticion);
    await controlador.findByBooking(peticion, 'r-1');

    expect(servicio.findByClient).toHaveBeenCalledWith('u-1');
    expect(servicio.findByBooking).toHaveBeenCalledWith('r-1', {
      id: 'u-1',
      role: UserRole.ADMIN,
      soloLectura: true,
    });
  });
});
