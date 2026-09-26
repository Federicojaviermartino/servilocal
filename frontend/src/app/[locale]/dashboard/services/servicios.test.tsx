import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import ServicesPage from './page';

const getByProvider = vi.fn();
const remove = vi.fn();
const toastError = vi.fn();
const toastExito = vi.fn();

vi.mock('@/lib/api', () => ({
  servicesApi: {
    getByProvider: (id: string) => getByProvider(id),
    remove: (id: string) => remove(id),
    create: vi.fn(),
    update: vi.fn(),
  },
  categoriesApi: { getAll: vi.fn(async () => ({ data: [] })) },
}));

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({ user: { id: 'p1', role: 'provider' } }),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    error: (m: string) => toastError(m),
    success: (m: string) => toastExito(m),
  }),
}));

const SERVICIO = {
  id: 's1',
  providerId: 'p1',
  title: 'Reparación de grifos',
  description: 'Cambio de grifos y arreglo de fugas.',
  priceMin: 40,
  priceMax: 90,
  priceUnit: 'por hora',
  city: 'Málaga',
  isActive: true,
  averageRating: 0,
  totalReviews: 0,
  createdAt: '2026-09-01T10:00:00.000Z',
};

async function pintarYEliminar() {
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <ServicesPage />
    </NextIntlClientProvider>,
  );
  await screen.findByText(SERVICIO.title);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(
    screen.getByRole('button', { name: new RegExp(es.comun.eliminar, 'i') }),
  );
}

describe('Mis servicios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getByProvider.mockResolvedValue({ data: [SERVICIO] });
  });

  it('eliminar uno con reservas abiertas dice por qué no se puede', async () => {
    // Antes se borraba con sus reservas; ahora la API lo impide, y la
    // pantalla tiene que explicar qué hacer en vez de un «no se pudo».
    remove.mockRejectedValueOnce({
      response: { status: 409, data: { codigo: 'reservas-abiertas' } },
    });

    await pintarYEliminar();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        es.erroresApi['reservas-abiertas'],
      ),
    );
  });

  it('un fallo sin código sigue con su mensaje de siempre', async () => {
    remove.mockRejectedValueOnce({ response: { status: 500, data: {} } });

    await pintarYEliminar();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(es.serviciosPanel.errorEliminar),
    );
  });
});
