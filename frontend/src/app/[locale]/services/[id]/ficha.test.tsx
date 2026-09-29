import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import type { Review, Service } from '@/types';
import FichaServicio from './ficha';

const getById = vi.fn();
const getByService = vi.fn();

vi.mock('@/lib/api', () => ({
  servicesApi: { getById: (id: string) => getById(id) },
  reviewsApi: { getByService: (id: string) => getByService(id) },
}));

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({ isAuthenticated: false }),
}));

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

// El asistente tiene sus propias pruebas.
vi.mock('@/components/organisms/AsistenteBusqueda', () => ({
  default: () => null,
}));

const SERVICIO = {
  id: 's1',
  title: 'Reparación de grifos',
  description: 'Cambio de grifos y arreglo de fugas.',
  city: 'Málaga',
  priceMin: 40,
  priceUnit: 'por hora',
  averageRating: 4.5,
  totalReviews: 1,
  provider: { firstName: 'Luis', lastName: 'Gómez' },
} as unknown as Service;

const VALORACION = {
  id: 'r1',
  rating: 5,
  comment: 'Vino puntual y lo dejó perfecto',
  client: { firstName: 'Ana', lastName: 'Ruiz' },
} as unknown as Review;

const pintar = (inicial?: { servicio: Service; valoraciones: Review[] }) =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <FichaServicio serviceId="s1" inicial={inicial} />
    </NextIntlClientProvider>,
  );

describe('La ficha de un servicio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('con lo que trae el servidor, se pinta entera de entrada y no pide nada', () => {
    // Antes llegaba en esqueletos: un buscador no veía ni el título.
    pintar({ servicio: SERVICIO, valoraciones: [VALORACION] });

    expect(
      screen.getByRole('heading', { level: 1, name: SERVICIO.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(/40\s€ por hora/)).toBeInTheDocument();
    expect(screen.getByText(VALORACION.comment!)).toBeInTheDocument();
    expect(getById).not.toHaveBeenCalled();
    expect(getByService).not.toHaveBeenCalled();
  });

  it('lo que escribe cada cual toma su propia dirección', () => {
    // En árabe, un texto en castellano se leía al revés: la puntuación y el
    // corte quedaban en el lado equivocado.
    pintar({
      servicio: {
        ...SERVICIO,
        provider: { ...SERVICIO.provider, bio: 'Fontanero desde 2010.' },
      },
      valoraciones: [{ ...VALORACION, providerResponse: 'Gracias, Ana.' }],
    });

    for (const texto of [
      SERVICIO.title,
      SERVICIO.description,
      VALORACION.comment!,
      'Gracias, Ana.',
      'Fontanero desde 2010.',
    ]) {
      expect(screen.getByText(texto)).toHaveAttribute('dir', 'auto');
    }
  });

  it('si el servidor no pudo preguntar, lo pide desde el navegador', async () => {
    getById.mockResolvedValue({ data: SERVICIO });
    getByService.mockResolvedValue({ data: [] });

    pintar();

    expect(
      await screen.findByRole('heading', { level: 1, name: SERVICIO.title }),
    ).toBeInTheDocument();
    expect(getById).toHaveBeenCalledWith('s1');
  });

  it('y si tampoco desde ahí, dice qué ha pasado', async () => {
    getById.mockRejectedValue({ response: { status: 404 } });
    getByService.mockResolvedValue({ data: [] });

    pintar();

    expect(
      await screen.findByText(es.detalle.noEncontradoTitulo),
    ).toBeInTheDocument();
  });
});
