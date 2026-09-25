import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import { BookingStatus, PaymentStatus, UserRole } from '@/types';
import BookingDetailPage from './page';

const getById = vi.fn();
const getByBooking = vi.fn();

vi.mock('@/lib/api', () => ({
  bookingsApi: {
    getById: (id: string) => getById(id),
    updateStatus: vi.fn(),
  },
  paymentsApi: { getByBooking: (id: string) => getByBooking(id) },
}));

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
    expect(screen.getByText('45 euros')).toBeInTheDocument();
    expect(screen.getByText('No description.')).toBeInTheDocument();
    expect(screen.getByText(/ at /)).toBeInTheDocument();
    expect(screen.queryByText(/a las|Importe|Sin descripción/)).toBeNull();
  });
});
