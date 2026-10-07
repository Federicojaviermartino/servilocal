import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import type { Review, Service } from '@/types';
import FichaServicio from './ficha';

const getById = vi.fn();
const getByService = vi.fn();

const responder = vi.fn();
let sesion: {
  isAuthenticated: boolean;
  user?: { id: string; role?: string };
} = {
  isAuthenticated: false,
};

vi.mock('@/lib/api', () => ({
  servicesApi: { getById: (id: string) => getById(id) },
  reviewsApi: {
    getByService: (id: string) => getByService(id),
    respond: (id: string, texto: string) => responder(id, texto),
  },
}));

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => sesion,
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/services/s1',
}));

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

const pintar = (
  inicial?: { servicio: Service; valoraciones: Review[] },
  idioma = 'es',
) =>
  render(
    <NextIntlClientProvider locale={idioma} messages={es as never}>
      <FichaServicio serviceId="s1" inicial={inicial} />
    </NextIntlClientProvider>,
  );

describe('La ficha de un servicio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sesion = { isAuthenticated: false };
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

  it('y en otro idioma, dice que está en castellano', () => {
    // El catálogo está en castellano. Sin marcarlo, en /ar o en /de un
    // lector de pantalla lo leía con la voz del idioma de la página.
    const inicial = {
      servicio: {
        ...SERVICIO,
        provider: { ...SERVICIO.provider, bio: 'Fontanero desde 2010.' },
      },
      valoraciones: [{ ...VALORACION, providerResponse: 'Gracias, Ana.' }],
    };
    const textos = [
      SERVICIO.title,
      SERVICIO.description,
      VALORACION.comment!,
      'Gracias, Ana.',
      'Fontanero desde 2010.',
    ];

    const enArabe = pintar(inicial, 'ar');
    for (const texto of textos) {
      expect(screen.getByText(texto)).toHaveAttribute('lang', 'es');
    }
    enArabe.unmount();

    // En la página en castellano ya lo dice el documento.
    pintar(inicial);
    for (const texto of textos) {
      expect(screen.getByText(texto)).not.toHaveAttribute('lang');
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
    // Lo que no existe no aparece por reintentar.
    expect(
      screen.queryByRole('button', { name: es.comun.reintentar }),
    ).not.toBeInTheDocument();
  });

  it('sin red, deja reintentar sin recargar la página', async () => {
    getById
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ data: SERVICIO });
    getByService.mockResolvedValue({ data: [] });

    pintar();
    await userEvent.click(
      await screen.findByRole('button', { name: es.comun.reintentar }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: SERVICIO.title }),
    ).toBeInTheDocument();
    expect(getById).toHaveBeenCalledTimes(2);
  });

  describe('quién puede reservar y con quién se contacta', () => {
    const boton = (nombre: string) =>
      screen.queryByRole('button', { name: nombre });
    const deOtro = { ...SERVICIO, providerId: 'p1' } as unknown as Service;

    it('sin sesión se ofrecen las dos cosas: llevan a entrar', () => {
      pintar({ servicio: deOtro, valoraciones: [] });

      expect(boton(es.detalle.reservar)).toBeInTheDocument();
      expect(boton(es.detalle.contactar)).toBeInTheDocument();
    });

    it('a un cliente, también', () => {
      sesion = { isAuthenticated: true, user: { id: 'c1', role: 'client' } };
      pintar({ servicio: deOtro, valoraciones: [] });

      expect(boton(es.detalle.reservar)).toBeInTheDocument();
      expect(screen.queryByText(es.detalle.soloClientes)).toBeNull();
    });

    it.each(['provider', 'admin'])(
      'a una cuenta de %s no se le ofrece reservar, y se le dice por qué',
      (role) => {
        // La API solo deja reservar a clientes. Se ofrecía igual: rellenaban
        // el formulario entero y acababan en un 403.
        sesion = { isAuthenticated: true, user: { id: 'otro', role } };
        pintar({ servicio: deOtro, valoraciones: [] });

        expect(boton(es.detalle.reservar)).toBeNull();
        expect(screen.getByText(es.detalle.soloClientes)).toBeInTheDocument();
        expect(boton(es.detalle.contactar)).toBeInTheDocument();
      },
    );

    it('el dueño del servicio no se contacta a sí mismo', () => {
      sesion = { isAuthenticated: true, user: { id: 'p1', role: 'provider' } };
      pintar({ servicio: deOtro, valoraciones: [] });

      expect(boton(es.detalle.contactar)).toBeNull();
    });
  });

  describe('responder a una valoración', () => {
    const conProveedor = {
      ...SERVICIO,
      providerId: 'p1',
    } as unknown as Service;

    it('el profesional responde desde la ficha de su servicio', async () => {
      // La API lo permitía, pero ninguna pantalla lo ofrecía.
      sesion = { isAuthenticated: true, user: { id: 'p1' } };
      responder.mockResolvedValue({ data: {} });
      pintar({ servicio: conProveedor, valoraciones: [VALORACION] });

      await userEvent.click(
        screen.getByRole('button', { name: es.detalle.responder }),
      );
      await userEvent.type(
        screen.getByLabelText(es.detalle.tuRespuesta),
        'Gracias, Ana.',
      );
      await userEvent.click(
        screen.getByRole('button', { name: es.detalle.publicarRespuesta }),
      );

      expect(responder).toHaveBeenCalledWith('r1', 'Gracias, Ana.');
      expect(await screen.findByText('Gracias, Ana.')).toHaveAttribute(
        'dir',
        'auto',
      );
      expect(
        screen.queryByRole('button', { name: es.detalle.responder }),
      ).not.toBeInTheDocument();
    });

    it('nadie más lo ve', () => {
      sesion = { isAuthenticated: true, user: { id: 'otro' } };
      pintar({ servicio: conProveedor, valoraciones: [VALORACION] });

      expect(
        screen.queryByRole('button', { name: es.detalle.responder }),
      ).not.toBeInTheDocument();
    });

    it('lo ya respondido no se vuelve a ofrecer', () => {
      sesion = { isAuthenticated: true, user: { id: 'p1' } };
      pintar({
        servicio: conProveedor,
        valoraciones: [{ ...VALORACION, providerResponse: 'Gracias.' }],
      });

      expect(
        screen.queryByRole('button', { name: es.detalle.responder }),
      ).not.toBeInTheDocument();
    });
  });

  it('la reserva va antes que las reseñas, que es el orden en el móvil', () => {
    // En una columna, el precio y «Reservar» quedaban al final de todas las
    // reseñas, y nadie veía cuánto costaba.
    pintar({ servicio: SERVICIO, valoraciones: [VALORACION] });

    const reservar = screen.getByRole('button', { name: es.detalle.reservar });
    const resenas = screen.getByRole('heading', {
      level: 2,
      name: es.detalle.valoraciones.replace('{total}', '1'),
    });
    expect(
      reservar.compareDocumentPosition(resenas) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
