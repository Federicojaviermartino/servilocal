import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import { BookingStatus, PaymentStatus, UserRole } from '@/types';
import { CODIGO_SIN_PAGO_RETENIDO } from '@/lib/errores-api';
import BookingDetailPage from './page';

const getById = vi.fn();
const getByBooking = vi.fn();
const updateStatus = vi.fn();
const aviso = vi.fn();
const avisoExito = vi.fn();
const avisoError = vi.fn();

/** Completar exige que haya llegado la fecha. */
const AYER = new Date(Date.now() - 86_400_000).toISOString();

vi.mock('@/lib/api', () => ({
  bookingsApi: {
    getById: (id: string) => getById(id),
    updateStatus: (...argumentos: unknown[]) => updateStatus(...argumentos),
  },
  paymentsApi: { getByBooking: (id: string) => getByBooking(id) },
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign((m: string) => aviso(m), {
    error: (...argumentos: unknown[]) => avisoError(...argumentos),
    success: (m: string) => avisoExito(m),
  });
  return { default: toast };
});

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'b1' }) }));

let rol = UserRole.CLIENT;
vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({ user: { id: 'u1', role: rol } }),
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/dashboard/bookings/b1',
  };
});

const reserva = (status: BookingStatus, extra = {}) => ({
  id: 'b1',
  status,
  clientId: 'u1',
  providerId: 'u2',
  scheduledDate: '2027-03-10T09:30:00Z',
  totalPrice: 45,
  description: 'Cambiar el grifo de la cocina',
  service: { title: 'Fontanería urgente', city: 'Valencia' },
  client: { firstName: 'Ana', lastName: 'Núñez' },
  provider: { firstName: 'Luis', lastName: 'Gómez' },
  ...extra,
});

function pintar(idioma: 'es' | 'en' = 'es') {
  return render(
    <NextIntlClientProvider
      locale={idioma}
      messages={(idioma === 'es' ? es : en) as never}
      timeZone="Europe/Madrid"
    >
      <BookingDetailPage />
    </NextIntlClientProvider>,
  );
}

async function pintada(idioma: 'es' | 'en' = 'es') {
  pintar(idioma);
  await screen.findByText('Fontanería urgente');
  // El botón depende también del pago, que llega en su propia petición.
  await waitFor(() => expect(getByBooking).toHaveBeenCalled());
}

const pagarAhora = () => screen.queryByRole('button', { name: 'Pagar ahora' });

beforeEach(() => {
  rol = UserRole.CLIENT;
  getById.mockReset();
  getByBooking.mockReset();
  updateStatus.mockReset();
  aviso.mockReset();
  avisoExito.mockReset();
  avisoError.mockReset();
});

describe('Detalle de una reserva', () => {
  it('pendiente y sin pago, se puede pagar', async () => {
    getById.mockResolvedValue({ data: reserva(BookingStatus.PENDING) });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada();

    expect(
      await screen.findByRole('button', { name: 'Pagar ahora' }),
    ).toBeInTheDocument();
  });

  it('confirmada con la retención perdida, se puede volver a autorizar', async () => {
    // Es a donde lleva el aviso de que la retención ha caducado: si el
    // botón solo saliera en las pendientes, quien cierra el aviso no
    // tendría por dónde volver a pagar.
    getById.mockResolvedValue({ data: reserva(BookingStatus.CONFIRMED) });
    getByBooking.mockResolvedValue({
      data: { id: 'p1', bookingId: 'b1', status: PaymentStatus.FAILED },
    });

    await pintada();

    expect(
      await screen.findByRole('button', { name: 'Pagar ahora' }),
    ).toBeInTheDocument();
  });

  it.each([BookingStatus.PENDING, BookingStatus.CONFIRMED])(
    'con el dinero ya retenido no se ofrece pagar otra vez (%s)',
    async (estado) => {
      getById.mockResolvedValue({ data: reserva(estado) });
      getByBooking.mockResolvedValue({
        data: { id: 'p1', bookingId: 'b1', status: PaymentStatus.HELD },
      });

      await pintada();

      await waitFor(() => expect(pagarAhora()).not.toBeInTheDocument());
    },
  );

  it('una cerrada no se paga aunque el pago fallara', async () => {
    getById.mockResolvedValue({ data: reserva(BookingStatus.CANCELLED) });
    getByBooking.mockResolvedValue({
      data: { id: 'p1', bookingId: 'b1', status: PaymentStatus.FAILED },
    });

    await pintada();

    expect(pagarAhora()).not.toBeInTheDocument();
  });

  it('si no se sabe del pago, se paga solo mientras está pendiente', async () => {
    getByBooking.mockRejectedValue({ code: 'ECONNABORTED' });

    getById.mockResolvedValue({ data: reserva(BookingStatus.PENDING) });
    const { unmount } = pintar();
    expect(
      await screen.findByRole('button', { name: 'Pagar ahora' }),
    ).toBeInTheDocument();
    unmount();

    getById.mockResolvedValue({ data: reserva(BookingStatus.CONFIRMED) });
    await pintada();
    expect(pagarAhora()).not.toBeInTheDocument();
  });

  it('completada sin cobro, el cliente la puede pagar', async () => {
    // Es lo que elige el profesional al completarla sin nada retenido: que
    // el cliente pague después. Sin el botón, no tendría por dónde.
    getById.mockResolvedValue({ data: reserva(BookingStatus.COMPLETED) });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada();

    expect(
      await screen.findByRole('button', { name: 'Pagar ahora' }),
    ).toBeInTheDocument();
    expect(screen.getByText(es.reservasPanel.pagoPendiente)).toBeVisible();
  });

  it.each([
    PaymentStatus.COMPLETED,
    PaymentStatus.REFUNDED,
    PaymentStatus.HELD,
  ])('completada con el pago %s, no se ofrece pagar', async (estadoPago) => {
    getById.mockResolvedValue({ data: reserva(BookingStatus.COMPLETED) });
    getByBooking.mockResolvedValue({
      data: { id: 'p1', bookingId: 'b1', status: estadoPago },
    });

    await pintada();

    await waitFor(() => expect(pagarAhora()).not.toBeInTheDocument());
    expect(screen.queryByText(es.reservasPanel.pagoPendiente)).toBeNull();
  });

  it('el profesional ve que la completó sin cobro', async () => {
    rol = UserRole.PROVIDER;
    getById.mockResolvedValue({ data: reserva(BookingStatus.COMPLETED) });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada();

    expect(
      await screen.findByText(es.reservasPanel.completadaSinCobro),
    ).toBeVisible();
    expect(pagarAhora()).not.toBeInTheDocument();
  });

  describe('completar sin pago retenido', () => {
    const completar = () =>
      userEvent.click(
        screen.getByRole('button', { name: es.reservasPanel.completar }),
      );

    beforeEach(() => {
      rol = UserRole.PROVIDER;
      getById.mockResolvedValue({
        data: reserva(BookingStatus.CONFIRMED, { scheduledDate: AYER }),
      });
      getByBooking.mockResolvedValue({ data: '' });
      updateStatus.mockRejectedValueOnce({
        response: { status: 409, data: { codigo: CODIGO_SIN_PAGO_RETENIDO } },
      });
    });

    it('pregunta, y si acepta la completa sin cobro', async () => {
      const preguntar = vi.spyOn(window, 'confirm').mockReturnValue(true);
      updateStatus.mockResolvedValueOnce({ data: {} });
      await pintada();

      await completar();

      await waitFor(() => expect(updateStatus).toHaveBeenCalledTimes(2));
      expect(preguntar).toHaveBeenCalledWith(
        es.reservasPanel.completarSinCobro,
      );
      expect(updateStatus).toHaveBeenLastCalledWith(
        'b1',
        BookingStatus.COMPLETED,
        { sinCobro: true },
      );
      expect(avisoExito).toHaveBeenCalledWith(es.reservasPanel.actualizada);
      preguntar.mockRestore();
    });

    it('si prefiere esperar, la deja como estaba y lo dice', async () => {
      const preguntar = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await pintada();

      await completar();

      await waitFor(() =>
        expect(aviso).toHaveBeenCalledWith(es.reservasPanel.esperandoPago),
      );
      expect(updateStatus).toHaveBeenCalledTimes(1);
      expect(avisoExito).not.toHaveBeenCalled();
      preguntar.mockRestore();
    });
  });

  it('antes de su fecha no se ofrece completarla, y se dice cuándo', async () => {
    // Completar es cobrar: se podía cobrar un trabajo de la semana que
    // viene.
    rol = UserRole.PROVIDER;
    getById.mockResolvedValue({ data: reserva(BookingStatus.CONFIRMED) });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada();

    expect(
      screen.queryByRole('button', { name: es.reservasPanel.completar }),
    ).toBeNull();
    expect(screen.getByText(es.reservasPanel.completarDesde)).toBeVisible();
  });

  it('llegada la fecha, sí', async () => {
    rol = UserRole.PROVIDER;
    getById.mockResolvedValue({
      data: reserva(BookingStatus.CONFIRMED, { scheduledDate: AYER }),
    });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada();

    expect(
      screen.getByRole('button', { name: es.reservasPanel.completar }),
    ).toBeVisible();
    expect(screen.queryByText(es.reservasPanel.completarDesde)).toBeNull();
  });

  it('un rechazo con código se explica en el idioma de quien mira', async () => {
    // El mensaje de la API está en castellano; con el código, la pantalla
    // pone el suyo.
    rol = UserRole.PROVIDER;
    getById.mockResolvedValue({ data: reserva(BookingStatus.PENDING) });
    getByBooking.mockResolvedValue({ data: '' });
    updateStatus.mockRejectedValueOnce({
      response: { status: 409, data: { codigo: 'solape' } },
    });

    await pintada('en');
    await userEvent.click(
      screen.getByRole('button', { name: en.reservasPanel.confirmar }),
    );

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(en.erroresApi.solape),
    );
  });

  it('la duración sale junto a la fecha', async () => {
    getById.mockResolvedValue({
      data: reserva(BookingStatus.PENDING, { durationMinutes: 90 }),
    });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada();

    expect(screen.getByText('Duración: 1,5 h')).toBeVisible();
  });

  it('el profesional no paga', async () => {
    rol = UserRole.PROVIDER;
    getById.mockResolvedValue({ data: reserva(BookingStatus.PENDING) });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada();

    expect(pagarAhora()).not.toBeInTheDocument();
  });

  it('el importe, la fecha y la falta de descripción salen en el idioma', async () => {
    // Estaban escritos en castellano dentro del componente: en inglés
    // decía «Importe», «a las» y «Sin descripción.».
    getById.mockResolvedValue({
      data: reserva(BookingStatus.COMPLETED, { description: '' }),
    });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada('en');

    expect(screen.getByText('Amount')).toBeInTheDocument();
    // Y el importe, como se escribe en inglés: era «45 euros» en todos.
    expect(screen.getByText('€45.00')).toBeInTheDocument();
    expect(screen.getByText('No description.')).toBeInTheDocument();
    expect(screen.getByText(/ at /)).toBeInTheDocument();
    expect(screen.queryByText(/a las|Importe|Sin descripción/)).toBeNull();
  });

  describe('cancelar', () => {
    const cancelar = () =>
      userEvent.click(
        screen.getByRole('button', { name: es.reservasPanel.cancelar }),
      );

    it('pregunta antes, y si se echa atrás no cancela nada', async () => {
      // Un clic bastaba para cancelarla, sin confirmar.
      getById.mockResolvedValue({ data: reserva(BookingStatus.CONFIRMED) });
      getByBooking.mockResolvedValue({ data: '' });
      const preguntar = vi.spyOn(window, 'prompt').mockReturnValue(null);
      await pintada();

      await cancelar();

      expect(preguntar).toHaveBeenCalledWith(
        es.reservasPanel.motivoCancelar,
        '',
      );
      expect(updateStatus).not.toHaveBeenCalled();
      preguntar.mockRestore();
    });

    it('el motivo que se escribe viaja con la cancelación', async () => {
      getById.mockResolvedValue({ data: reserva(BookingStatus.CONFIRMED) });
      getByBooking.mockResolvedValue({ data: '' });
      updateStatus.mockResolvedValue({ data: {} });
      const preguntar = vi
        .spyOn(window, 'prompt')
        .mockReturnValue('Me ha surgido un viaje');
      await pintada();

      await cancelar();

      await waitFor(() =>
        expect(updateStatus).toHaveBeenCalledWith(
          'b1',
          BookingStatus.CANCELLED,
          { cancellationReason: 'Me ha surgido un viaje' },
        ),
      );
      preguntar.mockRestore();
    });
  });

  it('una reserva cancelada enseña el motivo, si lo hay', async () => {
    // La API lo guardaba y la interfaz no lo enseñaba en ningún sitio.
    getById.mockResolvedValue({
      data: reserva(BookingStatus.CANCELLED, {
        cancellationReason: 'Me ha surgido un viaje',
      }),
    });
    getByBooking.mockResolvedValue({ data: '' });

    await pintada();

    expect(screen.getByText(es.reservasPanel.motivo)).toBeInTheDocument();
    expect(screen.getByText('Me ha surgido un viaje')).toBeInTheDocument();
  });

  it('con la sesión caducada, lo dice y ofrece volver a entrar', async () => {
    rol = UserRole.PROVIDER;
    getById.mockResolvedValue({
      data: reserva(BookingStatus.PENDING, {
        clientId: 'u9',
        providerId: 'u1',
      }),
    });
    getByBooking.mockResolvedValue({ data: '' });
    updateStatus.mockRejectedValue({ response: { status: 401, data: {} } });
    await pintada();

    await userEvent.click(
      screen.getByRole('button', { name: es.reservasPanel.confirmar }),
    );

    // El aviso lleva un enlace: se pinta con una función, no con un texto.
    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ id: 'sesion-caducada' }),
      ),
    );
  });
});
