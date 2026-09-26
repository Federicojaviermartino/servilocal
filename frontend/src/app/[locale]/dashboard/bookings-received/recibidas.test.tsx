import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import { BookingStatus } from '@/types';
import { CODIGO_SIN_PAGO_RETENIDO } from '@/lib/errores-api';
import BookingsReceivedPage from './page';

const getReceived = vi.fn();
const updateStatus = vi.fn();
const aviso = vi.fn();
const avisoExito = vi.fn();
const avisoError = vi.fn();

vi.mock('@/lib/api', () => ({
  bookingsApi: {
    getReceived: () => getReceived(),
    updateStatus: (...argumentos: unknown[]) => updateStatus(...argumentos),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign((m: string) => aviso(m), {
    error: (m: string) => avisoError(m),
    success: (m: string) => avisoExito(m),
  }),
}));

const AYER = new Date(Date.now() - 86_400_000).toISOString();
const MANANA = new Date(Date.now() + 86_400_000).toISOString();

const reserva = (status: BookingStatus, scheduledDate = MANANA) => ({
  id: 'b1',
  status,
  scheduledDate,
  totalPrice: 45,
  description: 'Cambiar el grifo de la cocina',
  service: { title: 'Fontanería urgente' },
  client: { firstName: 'Ana', lastName: 'Núñez' },
});

async function pintar(
  reservas: unknown[],
  idioma: 'es' | 'en' = 'es',
): Promise<void> {
  getReceived.mockResolvedValue({ data: reservas });
  render(
    <NextIntlClientProvider
      locale={idioma}
      messages={(idioma === 'es' ? es : en) as never}
      timeZone="Europe/Madrid"
    >
      <BookingsReceivedPage />
    </NextIntlClientProvider>,
  );
  await screen.findByText('Fontanería urgente');
}

describe('Reservas recibidas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('la fecha se lee en el idioma de quien mira', async () => {
    // «a las» estaba escrito en el componente: en inglés salía mezclado.
    await pintar([reserva(BookingStatus.PENDING)], 'en');

    expect(screen.getByText(/ at /)).toBeInTheDocument();
    expect(screen.queryByText(/a las/)).toBeNull();
  });

  it('antes de su fecha no se ofrece completar, y se dice cuándo', async () => {
    await pintar([reserva(BookingStatus.CONFIRMED, MANANA)]);

    expect(
      screen.queryByRole('button', { name: es.reservasPanel.completar }),
    ).toBeNull();
    expect(screen.getByText(es.reservasPanel.completarDesde)).toBeVisible();
  });

  it('sin nada retenido, pregunta antes de completar sin cobro', async () => {
    const preguntar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    updateStatus
      .mockRejectedValueOnce({
        response: { status: 409, data: { codigo: CODIGO_SIN_PAGO_RETENIDO } },
      })
      .mockResolvedValueOnce({ data: {} });
    await pintar([reserva(BookingStatus.CONFIRMED, AYER)]);

    await userEvent.click(
      screen.getByRole('button', { name: es.reservasPanel.completar }),
    );

    await waitFor(() =>
      expect(updateStatus).toHaveBeenLastCalledWith(
        'b1',
        BookingStatus.COMPLETED,
        { sinCobro: true },
      ),
    );
    expect(preguntar).toHaveBeenCalledWith(es.reservasPanel.completarSinCobro);
    preguntar.mockRestore();
  });

  it('aceptar una que choca con otra confirmada dice por qué', async () => {
    updateStatus.mockRejectedValueOnce({
      response: { status: 409, data: { codigo: 'solape' } },
    });
    await pintar([reserva(BookingStatus.PENDING)]);

    await userEvent.click(
      screen.getByRole('button', { name: es.reservasPanel.aceptar }),
    );

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(es.erroresApi.solape),
    );
  });
});
