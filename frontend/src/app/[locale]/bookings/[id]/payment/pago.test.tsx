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
  type Destino = string | { pathname: string; query?: Record<string, string> };
  return {
    Link: ({ href, children }: { href: Destino; children: React.ReactNode }) =>
      React.createElement(
        'a',
        {
          href:
            typeof href === 'string'
              ? href
              : `${href.pathname}?${new URLSearchParams(href.query)}`,
        },
        children,
      ),
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
    // La tarjeta queda guardada en Stripe para renovar la retención, y la
    // pantalla no lo decía.
    expect(screen.getByText(es.pago.tarjetaGuardada)).toBeVisible();
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
        'Se cobran 45,00 € en tu tarjeta ahora mismo: el profesional dio el trabajo por terminado antes de que pagaras.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(es.pago.retencionTitulo)).toBeNull();
    expect(screen.queryByText(es.pago.retencionCancelar)).toBeNull();
    // Un cobro en el acto no guarda la tarjeta.
    expect(screen.queryByText(es.pago.tarjetaGuardada)).toBeNull();
    expect(formulario).toHaveBeenCalledWith(
      expect.objectContaining({ estadoReserva: BookingStatus.COMPLETED }),
    );
  });

  /**
   * Lo que se ve cuando no se puede empezar a pagar. Ninguna prueba pasaba
   * por aquí, y es donde acaba quien llega con un enlace viejo, la sesión
   * caducada o el servidor dormido. El mensaje de la API nunca se enseña:
   * está en castellano.
   */
  describe('cuando no se puede empezar', () => {
    const conError = async (
      error: unknown,
      donde: 'reserva' | 'pago' = 'reserva',
    ) => {
      if (donde === 'reserva') {
        getById.mockRejectedValue(error);
      } else {
        getById.mockResolvedValue({ data: reserva(BookingStatus.PENDING) });
        createIntent.mockRejectedValue(error);
      }
      render(
        <NextIntlClientProvider locale="es" messages={es as never}>
          <PaymentPage />
        </NextIntlClientProvider>,
      );
      await screen.findByText(es.pago.errorIniciar);
    };
    const respuesta = (status: number, data: unknown = {}) => ({
      response: {
        status,
        data: { message: 'En castellano', ...(data as object) },
      },
    });
    const volverAlDetalle = () =>
      screen.getByRole('link', { name: es.pago.volverDetalle });

    it('sin servidor lo dice así, y no con un código', async () => {
      await conError(new Error('Network Error'));

      expect(screen.getByText(es.pago.sinServidor)).toBeVisible();
      expect(volverAlDetalle()).toHaveAttribute(
        'href',
        '/dashboard/bookings/b1',
      );
    });

    it('una reserva que no existe', async () => {
      await conError(respuesta(404));

      expect(screen.getByText(es.pago.noEncontrada)).toBeVisible();
      expect(createIntent).not.toHaveBeenCalled();
    });

    it('una reserva de otra persona', async () => {
      await conError(respuesta(403));

      expect(screen.getByText(es.pago.sinPermiso)).toBeVisible();
    });

    it('un pago que ya está en marcha, al preparar el pago', async () => {
      await conError(respuesta(409), 'pago');

      expect(screen.getByText(es.pago.pagoEnCurso)).toBeVisible();
      expect(screen.queryByText('En castellano')).toBeNull();
    });

    it('otro error, con su código para poder buscarlo', async () => {
      await conError(respuesta(500), 'pago');

      expect(
        screen.getByText(es.pago.errorCodigo.replace('{codigo}', '500')),
      ).toBeVisible();
    });

    it('con la sesión caducada, lleva a entrar y a volver aquí', async () => {
      // Sin esto, quien tardaba en pagar volvía al detalle, que también le
      // pedía entrar, y perdía el camino al pago.
      await conError(respuesta(401), 'pago');

      expect(screen.getByText(es.erroresApi['sesion-caducada'])).toBeVisible();
      const entrar = screen.getByRole('link', { name: es.carga.entrarDeNuevo });
      expect(decodeURIComponent(entrar.getAttribute('href') ?? '')).toContain(
        'redirect=/bookings/b1/payment',
      );
      expect(
        screen.queryByRole('link', { name: es.pago.volverDetalle }),
      ).toBeNull();
    });
  });
});
