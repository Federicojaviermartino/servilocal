import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../../../messages/es.json';
import type { Service } from '@/types';
import BookingPage from './page';

const getById = vi.fn();
const crear = vi.fn();
const empujar = vi.fn();
const cargarSesion = vi.fn();
const avisoExito = vi.fn();
const avisoError = vi.fn();
let autenticado = true;
let recordada = false;

vi.mock('@/lib/api', () => ({
  servicesApi: { getById: (id: string) => getById(id) },
  bookingsApi: { create: (datos: unknown) => crear(datos) },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));

// El mismo enrutador en cada render, como el de verdad: la carga del
// servicio depende de él y se repetiría con uno nuevo cada vez.
const enrutador = { push: (ruta: string) => empujar(ruta) };

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement('a', null, children),
    useRouter: () => enrutador,
    usePathname: () => '/services/s1/book',
  };
});

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({
    isAuthenticated: autenticado,
    loadFromStorage: cargarSesion,
  }),
  haySesionRecordada: () => recordada,
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: (m: string) => avisoExito(m),
    error: (...argumentos: unknown[]) => avisoError(...argumentos),
    dismiss: vi.fn(),
  }),
}));

const SERVICIO = {
  id: 's1',
  title: 'Reparación de grifos',
  priceMin: 40,
  priceMax: 90,
  priceUnit: 'por hora',
} as unknown as Service;

const CLAVE_BORRADOR = 'borrador:reserva:s1';
const DESCRIPCION = 'Gotea el grifo de la cocina desde ayer.';

/** Un día contado desde hoy, en la fecha local, como la pide el campo. */
function diaLocal(dentroDe: number): string {
  const dia = new Date();
  dia.setDate(dia.getDate() + dentroDe);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dia.getFullYear()}-${dos(dia.getMonth() + 1)}-${dos(dia.getDate())}`;
}

const pintar = () =>
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <BookingPage />
    </NextIntlClientProvider>,
  );

/** Pinta la página y espera a que llegue el servicio. */
async function pintada() {
  const pintado = pintar();
  await screen.findByRole('heading', {
    level: 1,
    name: es.reserva.titulo.replace('{servicio}', SERVICIO.title),
  });
  return pintado;
}

async function reservar() {
  await userEvent.type(
    screen.getByLabelText(es.reserva.descripcionTrabajo),
    DESCRIPCION,
  );
  await userEvent.click(
    screen.getByRole('button', { name: es.reserva.continuar }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getById.mockReset();
  crear.mockReset();
  autenticado = true;
  recordada = false;
});

afterEach(() => {
  sessionStorage.clear();
});

describe('Reservar un servicio', () => {
  describe('sin sesión', () => {
    it('manda a entrar, y a volver aquí después', async () => {
      autenticado = false;

      pintar();

      await waitFor(() =>
        expect(empujar).toHaveBeenCalledWith(
          '/auth/login?redirect=/services/s1/book',
        ),
      );
      expect(getById).not.toHaveBeenCalled();
    });

    it('con una sesión recordada que aún no se ha cargado, espera sin echar a nadie', async () => {
      // En el primer render el almacén todavía está vacío: sin esto, quien
      // ya había entrado acababa en la pantalla de acceso.
      autenticado = false;
      recordada = true;

      pintar();

      await waitFor(() => expect(cargarSesion).toHaveBeenCalled());
      expect(empujar).not.toHaveBeenCalled();
      expect(getById).not.toHaveBeenCalled();
      expect(
        screen.getByRole('status', { name: es.comun.cargando }),
      ).toBeInTheDocument();
    });
  });

  it('con sesión, carga el servicio y lo pone en el título', async () => {
    getById.mockResolvedValue({ data: SERVICIO });

    await pintada();

    expect(getById).toHaveBeenCalledWith('s1');
    expect(empujar).not.toHaveBeenCalled();
    expect(screen.queryByText(es.comun.borradorRecuperado)).toBeNull();
  });

  it('un fallo al pedirlo no es un servicio que no existe: lo dice y deja reintentar', async () => {
    // Un corte de red o la API dormida se decían «servicio no disponible»,
    // y no había forma de volver a intentarlo.
    getById
      .mockRejectedValueOnce({ code: 'ERR_NETWORK' })
      .mockResolvedValueOnce({ data: SERVICIO });

    pintar();

    expect(await screen.findByText(es.carga.error)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: es.reserva.servicioNoDisponible }),
    ).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: es.carga.reintentar }),
    );

    expect(
      await screen.findByRole('button', { name: es.reserva.continuar }),
    ).toBeInTheDocument();
    expect(getById).toHaveBeenCalledTimes(2);
  });

  it('con la sesión caducada, ofrece volver a entrar', async () => {
    getById.mockRejectedValue({ response: { status: 401 } });

    pintar();

    expect(
      await screen.findByText(es.carga.sesionCaducada),
    ).toBeInTheDocument();
  });

  it('si el servicio no está disponible, lo dice', async () => {
    getById.mockRejectedValue({ response: { status: 404 } });

    pintar();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: es.reserva.servicioNoDisponible,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: es.reserva.continuar }),
    ).toBeNull();
  });

  it('enviar crea la reserva y lleva a pagarla', async () => {
    getById.mockResolvedValue({ data: SERVICIO });
    crear.mockResolvedValue({ data: { id: 'b9' } });
    await pintada();

    await reservar();

    await waitFor(() =>
      expect(empujar).toHaveBeenCalledWith('/bookings/b9/payment'),
    );
    expect(crear).toHaveBeenCalledWith({
      serviceId: 's1',
      scheduledDate: new Date(`${diaLocal(1)}T10:00:00`).toISOString(),
      description: DESCRIPCION,
      totalPrice: 40,
    });
    expect(avisoExito).toHaveBeenCalledWith(es.reserva.creada);
  });

  it('mientras se envía no deja enviarla otra vez', async () => {
    getById.mockResolvedValue({ data: SERVICIO });
    crear.mockReturnValue(new Promise(() => {}));
    await pintada();

    await reservar();

    expect(
      screen.getByRole('button', { name: es.comun.cargando }),
    ).toBeDisabled();
    expect(crear).toHaveBeenCalledTimes(1);
  });

  describe('si no se puede crear', () => {
    it('un rechazo con código se explica en el idioma, sin guardar borrador', async () => {
      // El mensaje de la API está en castellano; con el código, la pantalla
      // pone el suyo.
      getById.mockResolvedValue({ data: SERVICIO });
      crear.mockRejectedValue({
        response: { status: 409, data: { codigo: 'solape' } },
      });
      await pintada();

      await reservar();

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(es.erroresApi.solape),
      );
      expect(sessionStorage.getItem(CLAVE_BORRADOR)).toBeNull();
      expect(empujar).not.toHaveBeenCalled();
    });

    it('cualquier otro fallo, con la frase de la pantalla, y deja volver a intentarlo', async () => {
      getById.mockResolvedValue({ data: SERVICIO });
      crear.mockRejectedValue({ response: { status: 500, data: {} } });
      await pintada();

      await reservar();

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(es.reserva.errorCrear),
      );
      expect(
        screen.getByRole('button', { name: es.reserva.continuar }),
      ).toBeEnabled();
      expect(screen.getByLabelText(es.reserva.descripcionTrabajo)).toHaveValue(
        DESCRIPCION,
      );
    });
  });

  describe('con la sesión caducada al enviar', () => {
    it('lo dice, ofrece volver a entrar y guarda lo escrito', async () => {
      getById.mockResolvedValue({ data: SERVICIO });
      crear.mockRejectedValue({ response: { status: 401, data: {} } });
      await pintada();

      await reservar();

      // El aviso lleva un enlace: se pinta con una función, no con un texto.
      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({ id: 'sesion-caducada' }),
        ),
      );
      expect(JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR)!)).toEqual({
        scheduledDate: new Date(`${diaLocal(1)}T10:00:00`).toISOString(),
        description: DESCRIPCION,
        totalPrice: 40,
      });
    });

    it('y al volver, el formulario nace con ello y lo avisa', async () => {
      // Para volver a entrar había que salir de la página y se perdía.
      getById.mockResolvedValue({ data: SERVICIO });
      crear.mockRejectedValueOnce({ response: { status: 401, data: {} } });
      const { unmount } = await pintada();
      await reservar();
      await waitFor(() => expect(avisoError).toHaveBeenCalled());
      unmount();

      await pintada();

      expect(screen.getByLabelText(es.reserva.descripcionTrabajo)).toHaveValue(
        DESCRIPCION,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        es.comun.borradorRecuperado,
      );
    });
  });

  it('un borrador que ya estaba al abrir se usa entero, y se olvida', async () => {
    // Olvidarlo evita que vuelva a salir la próxima vez que se abra.
    const fecha = new Date(`${diaLocal(3)}T16:45:00`).toISOString();
    sessionStorage.setItem(
      CLAVE_BORRADOR,
      JSON.stringify({
        scheduledDate: fecha,
        description: 'Gotea el grifo del baño',
        totalPrice: 55,
      }),
    );
    getById.mockResolvedValue({ data: SERVICIO });

    await pintada();

    expect(screen.getByText(es.comun.borradorRecuperado)).toBeInTheDocument();
    expect(screen.getByLabelText(es.reserva.fecha)).toHaveValue(diaLocal(3));
    expect(screen.getByLabelText(es.reserva.hora)).toHaveValue('16:45');
    expect(screen.getByLabelText(es.reserva.descripcionTrabajo)).toHaveValue(
      'Gotea el grifo del baño',
    );
    expect(screen.getByRole('spinbutton')).toHaveValue(55);
    expect(sessionStorage.getItem(CLAVE_BORRADOR)).toBeNull();
  });

  it('el borrador de otro servicio no se mezcla', async () => {
    sessionStorage.setItem(
      'borrador:reserva:s2',
      JSON.stringify({
        scheduledDate: new Date().toISOString(),
        description: 'Pintar el salón entero',
        totalPrice: 300,
      }),
    );
    getById.mockResolvedValue({ data: SERVICIO });

    await pintada();

    expect(screen.queryByText(es.comun.borradorRecuperado)).toBeNull();
    expect(screen.getByLabelText(es.reserva.descripcionTrabajo)).toHaveValue(
      '',
    );
    expect(sessionStorage.getItem('borrador:reserva:s2')).not.toBeNull();
  });
});
