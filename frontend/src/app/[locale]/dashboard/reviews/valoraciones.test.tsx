import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../messages/es.json';
import { BookingStatus } from '@/types';
import MyReviewsPage from './page';

const getMyBookings = vi.fn();
const getMyReviews = vi.fn();
const crear = vi.fn();
const avisoExito = vi.fn();
const avisoError = vi.fn();

vi.mock('@/lib/api', () => ({
  bookingsApi: { getMyBookings: () => getMyBookings() },
  reviewsApi: {
    getMyReviews: () => getMyReviews(),
    create: (datos: unknown) => crear(datos),
  },
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement('a', null, children),
    usePathname: () => '/dashboard/reviews',
  };
});

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: (m: string) => avisoExito(m),
    error: (...argumentos: unknown[]) => avisoError(...argumentos),
    dismiss: vi.fn(),
  }),
}));

const reserva = (
  id: string,
  status: BookingStatus,
  titulo: string,
  serviceId = `s-${id}`,
) => ({
  id,
  status,
  serviceId,
  service: { title: titulo },
  provider: { firstName: 'Luis', lastName: 'Gómez' },
});

const GRIFO = reserva(
  'b1',
  BookingStatus.COMPLETED,
  'Reparación de grifos',
  's1',
);

const valoracion = (bookingId: string, extra = {}) => ({
  id: `r-${bookingId}`,
  bookingId,
  rating: 4,
  comment: 'Vino puntual y lo dejó perfecto',
  createdAt: '2026-03-10T12:00:00Z',
  ...extra,
});

// Los borradores se guardan con quien entró: ver borrador.ts.
vi.mock('@/lib/auth-store', async (original) => ({
  ...(await original<typeof import('@/lib/auth-store')>()),
  idRecordado: () => 'c1',
}));

const CLAVE_BORRADOR = 'borrador:c1:valoracion:b1';

const pintar = () =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <MyReviewsPage />
    </NextIntlClientProvider>,
  );

/** Pinta la página y espera a que lleguen las dos listas. */
async function pintada() {
  const pintado = pintar();
  await screen.findByRole('heading', {
    level: 1,
    name: es.valoracionesPanel.pendientes,
  });
  return pintado;
}

const comentario = () =>
  screen.getByRole('textbox', {
    name: es.valoracionesPanel.comentarioPlaceholder,
  });

const enviar = () =>
  userEvent.click(
    screen.getByRole('button', { name: es.valoracionesPanel.enviar }),
  );

const enviadas = (total: number) =>
  es.valoracionesPanel.enviadas.replace('{total}', String(total));

beforeEach(() => {
  getMyBookings.mockReset();
  getMyReviews.mockReset();
  crear.mockReset();
  avisoExito.mockReset();
  avisoError.mockReset();
});

afterEach(() => {
  sessionStorage.clear();
});

describe('Mis valoraciones', () => {
  it('pendientes son las completadas que aún no tienen valoración', async () => {
    // Ni las que están por hacer ni las ya valoradas.
    getMyBookings.mockResolvedValue({
      data: [
        GRIFO,
        reserva('b2', BookingStatus.COMPLETED, 'Pintura del salón'),
        reserva('b3', BookingStatus.CONFIRMED, 'Instalación de enchufes'),
      ],
    });
    getMyReviews.mockResolvedValue({ data: [valoracion('b2')] });

    await pintada();

    expect(screen.getByText('Reparación de grifos')).toBeInTheDocument();
    expect(screen.getByText('Con Luis Gómez')).toBeInTheDocument();
    expect(screen.queryByText('Pintura del salón')).toBeNull();
    expect(screen.queryByText('Instalación de enchufes')).toBeNull();
    expect(
      screen.getAllByRole('button', { name: es.valoracionesPanel.enviar }),
    ).toHaveLength(1);
  });

  it('las enviadas salen con su cuenta, su comentario y su fecha', async () => {
    getMyBookings.mockResolvedValue({ data: [] });
    getMyReviews.mockResolvedValue({
      data: [valoracion('b2'), valoracion('b3', { comment: undefined })],
    });

    await pintada();

    expect(
      screen.getByRole('heading', { level: 2, name: enviadas(2) }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vino puntual y lo dejó perfecto'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('10/3/2026')).toHaveLength(2);
    expect(screen.getByText(es.valoracionesPanel.sinPendientes)).toBeVisible();
  });

  it.each([
    ['listas vacías', []],
    ['nada en lugar de listas', null],
  ])('sin nada que valorar ni enviado, lo dice (%s)', async (_c, datos) => {
    getMyBookings.mockResolvedValue({ data: datos });
    getMyReviews.mockResolvedValue({ data: datos });

    await pintada();

    expect(
      screen.getByText(es.valoracionesPanel.sinPendientes),
    ).toBeInTheDocument();
    expect(
      screen.getByText(es.valoracionesPanel.sinEnviadas),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: enviadas(0) }),
    ).toBeInTheDocument();
  });

  describe('si no se pueden cargar', () => {
    it('lo dice en lugar de decir que no hay ninguna, y deja reintentar', async () => {
      // Antes un fallo vaciaba las dos listas, y quien tenía valoraciones
      // pendientes leía que no le quedaba ninguna.
      getMyBookings
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValue({ data: [GRIFO] });
      getMyReviews.mockResolvedValue({ data: [] });
      pintar();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.carga.error,
      );
      expect(screen.queryByText(es.valoracionesPanel.sinPendientes)).toBeNull();

      await userEvent.click(
        screen.getByRole('button', { name: es.carga.reintentar }),
      );

      expect(
        await screen.findByText('Reparación de grifos'),
      ).toBeInTheDocument();
    });

    it('con la sesión caducada, ofrece volver a entrar', async () => {
      getMyBookings.mockRejectedValue({ response: { status: 401 } });
      getMyReviews.mockResolvedValue({ data: [] });

      pintar();

      expect(
        await screen.findByText(es.carga.sesionCaducada),
      ).toBeInTheDocument();
      expect(screen.queryByText(es.valoracionesPanel.sinPendientes)).toBeNull();
    });
  });

  it('el comentario tiene nombre accesible, no solo el texto de ejemplo', async () => {
    // El texto de ejemplo desaparece al escribir y no todos los lectores de
    // pantalla lo anuncian.
    getMyBookings.mockResolvedValue({ data: [GRIFO] });
    getMyReviews.mockResolvedValue({ data: [] });

    await pintada();

    expect(comentario()).toBeInTheDocument();
  });

  describe('enviar una valoración', () => {
    it('manda las estrellas y el comentario, avisa y deja de estar pendiente', async () => {
      getMyBookings.mockResolvedValue({ data: [GRIFO] });
      getMyReviews.mockResolvedValue({ data: [] });
      crear.mockResolvedValue({ data: valoracion('b1') });
      await pintada();

      await userEvent.click(screen.getByRole('radio', { name: '4 estrellas' }));
      await userEvent.type(comentario(), 'Muy puntual y limpio');
      await enviar();

      await waitFor(() =>
        expect(avisoExito).toHaveBeenCalledWith(es.valoracionesPanel.enviada),
      );
      expect(crear).toHaveBeenCalledWith({
        bookingId: 'b1',
        serviceId: 's1',
        rating: 4,
        comment: 'Muy puntual y limpio',
      });
      // La reserva pasa a las enviadas con lo que guardó la API, sin volver
      // a pedirlo todo.
      expect(
        await screen.findByText(es.valoracionesPanel.sinPendientes),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: enviadas(1) }),
      ).toBeInTheDocument();
      expect(getMyBookings).toHaveBeenCalledTimes(1);
    });

    it('enviar una no borra lo que se está escribiendo en otra', async () => {
      // Cada envío recargaba la pantalla entera: mientras cargaba se
      // desmontaban los demás formularios, y lo escrito en ellos se perdía.
      const LUZ = reserva('b2', BookingStatus.COMPLETED, 'Enchufes', 's2');
      getMyBookings.mockResolvedValue({ data: [GRIFO, LUZ] });
      getMyReviews.mockResolvedValue({ data: [] });
      crear.mockResolvedValue({ data: valoracion('b1') });
      await pintada();
      const [primero, segundo] = screen.getAllByRole('textbox', {
        name: es.valoracionesPanel.comentarioPlaceholder,
      });
      await userEvent.type(segundo, 'Todavía lo estoy pensando');

      await userEvent.type(primero, 'Muy bien');
      await userEvent.click(
        screen.getAllByRole('button', { name: es.valoracionesPanel.enviar })[0],
      );

      await waitFor(() =>
        expect(avisoExito).toHaveBeenCalledWith(es.valoracionesPanel.enviada),
      );
      expect(
        screen.getByRole('textbox', {
          name: es.valoracionesPanel.comentarioPlaceholder,
        }),
      ).toHaveValue('Todavía lo estoy pensando');
    });

    it('sin comentario, empieza en cinco estrellas y no manda un texto vacío', async () => {
      getMyBookings.mockResolvedValue({ data: [GRIFO] });
      getMyReviews.mockResolvedValue({ data: [] });
      crear.mockResolvedValue({ data: {} });
      await pintada();

      await enviar();

      await waitFor(() => expect(crear).toHaveBeenCalled());
      expect(crear).toHaveBeenCalledWith({
        bookingId: 'b1',
        serviceId: 's1',
        rating: 5,
        comment: undefined,
      });
    });

    it('mientras se envía no deja enviarla otra vez', async () => {
      getMyBookings.mockResolvedValue({ data: [GRIFO] });
      getMyReviews.mockResolvedValue({ data: [] });
      crear.mockReturnValue(new Promise(() => {}));
      await pintada();

      await enviar();

      expect(
        screen.getByRole('button', { name: es.comun.cargando }),
      ).toBeDisabled();
    });

    it('si falla, lo dice sin perder lo escrito y deja volver a intentarlo', async () => {
      getMyBookings.mockResolvedValue({ data: [GRIFO] });
      getMyReviews.mockResolvedValue({ data: [] });
      crear.mockRejectedValue({ response: { status: 500, data: {} } });
      await pintada();

      await userEvent.type(comentario(), 'Muy puntual y limpio');
      await enviar();

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          es.valoracionesPanel.errorEnviar,
        ),
      );
      expect(avisoExito).not.toHaveBeenCalled();
      expect(comentario()).toHaveValue('Muy puntual y limpio');
      expect(
        screen.getByRole('button', { name: es.valoracionesPanel.enviar }),
      ).toBeEnabled();
      // Solo se guarda borrador cuando hay que volver a entrar.
      expect(sessionStorage.getItem(CLAVE_BORRADOR)).toBeNull();
    });
  });

  describe('con la sesión caducada al enviar', () => {
    it('lo dice, ofrece volver a entrar y guarda la valoración', async () => {
      getMyBookings.mockResolvedValue({ data: [GRIFO] });
      getMyReviews.mockResolvedValue({ data: [] });
      crear.mockRejectedValue({ response: { status: 401, data: {} } });
      await pintada();

      await userEvent.click(screen.getByRole('radio', { name: '3 estrellas' }));
      await userEvent.type(comentario(), 'Bien, aunque llegó tarde');
      await enviar();

      // El aviso lleva un enlace: se pinta con una función, no con un texto.
      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({ id: 'sesion-caducada' }),
        ),
      );
      expect(JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR)!)).toEqual({
        rating: 3,
        comment: 'Bien, aunque llegó tarde',
      });
    });

    it('y al volver la recupera, estrellas incluidas, y lo avisa', async () => {
      // Para volver a entrar había que salir de la página y se perdía.
      getMyBookings.mockResolvedValue({ data: [GRIFO] });
      getMyReviews.mockResolvedValue({ data: [] });
      crear.mockRejectedValueOnce({ response: { status: 401, data: {} } });
      const { unmount } = await pintada();
      await userEvent.click(screen.getByRole('radio', { name: '3 estrellas' }));
      await userEvent.type(comentario(), 'Bien, aunque llegó tarde');
      await enviar();
      await waitFor(() => expect(avisoError).toHaveBeenCalled());
      unmount();

      crear.mockResolvedValue({ data: {} });
      await pintada();

      expect(comentario()).toHaveValue('Bien, aunque llegó tarde');
      expect(screen.getByRole('status')).toHaveTextContent(
        es.comun.borradorRecuperado,
      );
      // Se olvida al recuperarlo, para que no vuelva a salir otra vez.
      expect(sessionStorage.getItem(CLAVE_BORRADOR)).toBeNull();

      await enviar();

      await waitFor(() =>
        expect(crear).toHaveBeenLastCalledWith(
          expect.objectContaining({
            rating: 3,
            comment: 'Bien, aunque llegó tarde',
          }),
        ),
      );
    });

    it('el borrador de otra reserva no se mezcla', async () => {
      sessionStorage.setItem(
        'borrador:c1:valoracion:b2',
        JSON.stringify({ rating: 1, comment: 'De otra reserva' }),
      );
      getMyBookings.mockResolvedValue({ data: [GRIFO] });
      getMyReviews.mockResolvedValue({ data: [] });

      await pintada();

      expect(comentario()).toHaveValue('');
      expect(screen.queryByText(es.comun.borradorRecuperado)).toBeNull();
    });
  });

  it('sin estrellas no se envía', async () => {
    // Empieza en cinco y las estrellas solo dan de una a cinco: lo único que
    // puede traer un cero es un borrador guardado. Aun así, no se manda.
    sessionStorage.setItem(
      CLAVE_BORRADOR,
      JSON.stringify({ rating: 0, comment: 'Sin decidir' }),
    );
    getMyBookings.mockResolvedValue({ data: [GRIFO] });
    getMyReviews.mockResolvedValue({ data: [] });
    await pintada();

    await enviar();

    expect(avisoError).toHaveBeenCalledWith(es.valoracionesPanel.selecciona);
    expect(crear).not.toHaveBeenCalled();
  });
});
