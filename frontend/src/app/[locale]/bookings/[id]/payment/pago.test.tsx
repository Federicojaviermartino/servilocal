import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../../messages/es.json';
import { BookingStatus } from '@/types';
import PaymentPage from './page';

const getById = vi.fn();
const createIntent = vi.fn();
const formulario = vi.fn();

vi.mock('@/lib/api', () => ({
  bookingsApi: { getById: (id: string) => getById(id) },
  paymentsApi: { createIntent: (id: string) => createIntent(id) },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'b1' }) }));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
    useRouter: () => ({ push: vi.fn() }),
  };
});

vi.mock('@/lib/stripe', () => ({ getStripe: () => null }));
vi.mock('@/lib/tema', () => ({ useTemaOscuro: () => false }));

// Stripe y su formulario tienen sus propias pruebas: aquí basta con ver lo
// que la página les pasa.
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/organisms/CheckoutForm', () => ({
  default: (props: Record<string, unknown>) => {
    formulario(props);
    return null;
  },
}));

const reserva = (status: BookingStatus) => ({
  id: 'b1',
  status,
  totalPrice: 45,
  service: { title: 'Fontanería urgente' },
});

async function pintar(estado: BookingStatus) {
  getById.mockResolvedValue({ data: reserva(estado) });
  createIntent.mockResolvedValue({
    data: { clientSecret: 'cs_1', paymentIntentId: 'pi_1', amount: 45 },
  });
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <PaymentPage />
    </NextIntlClientProvider>,
  );
  await screen.findByText(es.pago.titulo);
}

describe('Página de pago', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('una reserva abierta explica que se retiene y cuándo se libera', async () => {
    await pintar(BookingStatus.PENDING);

    expect(screen.getByText(es.pago.retencionTitulo)).toBeVisible();
    expect(screen.getByText(es.pago.retencionCancelar)).toBeVisible();
    expect(formulario).toHaveBeenCalledWith(
      expect.objectContaining({ estadoReserva: BookingStatus.PENDING }),
    );
  });

  it('una completada dice que se cobra ahora, sin hablar de liberar nada', async () => {
    // Decir «no se te cobra ahora» justo antes de cobrar sería mentir.
    await pintar(BookingStatus.COMPLETED);

    expect(screen.getByText(es.pago.cobroTitulo)).toBeVisible();
    expect(
      screen.getByText(
        'Se cobran 45 euros en tu tarjeta ahora mismo: el profesional dio el trabajo por terminado antes de que pagaras.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(es.pago.retencionTitulo)).toBeNull();
    expect(screen.queryByText(es.pago.retencionCancelar)).toBeNull();
    expect(formulario).toHaveBeenCalledWith(
      expect.objectContaining({ estadoReserva: BookingStatus.COMPLETED }),
    );
  });
});
