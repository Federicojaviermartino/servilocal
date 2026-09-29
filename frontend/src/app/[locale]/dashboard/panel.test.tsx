import type { ReactElement } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import { BookingStatus, UserRole } from '@/types';
import DashboardHomePage from './page';
import MyBookingsPage from './bookings/page';
import MessagesPage from './messages/page';

const getMyBookings = vi.fn();
const getReceived = vi.fn();
const getConversations = vi.fn();
const replace = vi.fn();

vi.mock('@/lib/api', () => ({
  bookingsApi: {
    getMyBookings: () => getMyBookings(),
    getReceived: () => getReceived(),
  },
  messagesApi: { getConversations: () => getConversations() },
}));

let usuario: { id: string; firstName: string; role: UserRole } | null = null;
vi.mock('@/lib/auth-store', () => ({
  useAuthStore: () => ({ user: usuario }),
}));

const enrutador = { replace: (ruta: string) => replace(ruta), push: vi.fn() };
vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
    useRouter: () => enrutador,
    usePathname: () => '/dashboard',
  };
});

const CLIENTA = { id: 'u1', firstName: 'Ana', role: UserRole.CLIENT };
const PROFESIONAL = { id: 'u2', firstName: 'Luis', role: UserRole.PROVIDER };

const reserva = (id: string, status: BookingStatus, titulo: string) => ({
  id,
  status,
  scheduledDate: '2027-03-10T09:30:00Z',
  totalPrice: 45,
  service: { title: titulo, city: 'Valencia' },
  client: { firstName: 'Ana', lastName: 'Núñez' },
  provider: { firstName: 'Luis', lastName: 'Gómez' },
});

const RESERVAS = [
  reserva('b1', BookingStatus.PENDING, 'Fontanería urgente'),
  reserva('b2', BookingStatus.PENDING, 'Pintar el salón'),
  reserva('b3', BookingStatus.CONFIRMED, 'Clases de guitarra'),
  reserva('b4', BookingStatus.COMPLETED, 'Limpieza a fondo'),
  reserva('b5', BookingStatus.CANCELLED, 'Montar un armario'),
];

/** Un fallo de red: no hay respuesta del servidor. */
const SIN_RED = { code: 'ECONNABORTED' };
/** La cookie de sesión ya no vale. */
const SESION_CADUCADA = { response: { status: 401, data: {} } };

function pintar(pagina: ReactElement, idioma: 'es' | 'en' = 'es') {
  return render(
    <NextIntlClientProvider
      locale={idioma}
      messages={(idioma === 'es' ? es : en) as never}
      timeZone="Europe/Madrid"
    >
      {pagina}
    </NextIntlClientProvider>,
  );
}

/** El número que acompaña a una etiqueta del resumen. */
const contador = (etiqueta: string) =>
  screen.getByText(etiqueta).nextElementSibling?.textContent;

const enlaces = () =>
  screen.getAllByRole('link').map((enlace) => enlace.getAttribute('href'));

/**
 * El aviso de sesión caducada. Se busca por su texto porque el indicador de
 * carga también se anuncia como «status» y llega antes.
 */
const avisoDeSesion = async () =>
  (await screen.findByText(es.carga.sesionCaducada)).closest(
    '[role="status"]',
  ) as HTMLElement;

beforeEach(() => {
  usuario = CLIENTA;
  getMyBookings.mockReset().mockResolvedValue({ data: [] });
  getReceived.mockReset().mockResolvedValue({ data: [] });
  getConversations.mockReset().mockResolvedValue({ data: [] });
  replace.mockReset();
});

describe('Resumen del panel', () => {
  it('al cliente le saluda por su nombre y le lleva a buscar y a sus reservas', async () => {
    pintar(<DashboardHomePage />);

    await screen.findByText(es.panel.accesosRapidos);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hola, Ana' }),
    ).toBeInTheDocument();
    expect(screen.getByText(es.panel.resumenCliente)).toBeInTheDocument();
    expect(enlaces()).toEqual(['/services/search', '/dashboard/bookings']);
    expect(screen.getByText(es.panel.buscarServicio)).toBeInTheDocument();
    expect(screen.getByText(es.panel.verReservas)).toBeInTheDocument();
  });

  it('al profesional le lleva a sus servicios y a las reservas recibidas', async () => {
    usuario = PROFESIONAL;

    pintar(<DashboardHomePage />);

    await screen.findByText(es.panel.accesosRapidos);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hola, Luis' }),
    ).toBeInTheDocument();
    expect(screen.getByText(es.panel.resumenProfesional)).toBeInTheDocument();
    expect(enlaces()).toEqual([
      '/dashboard/services',
      '/dashboard/bookings-received',
    ]);
    expect(
      screen.getByText(es.reservasPanel.reservasRecibidas),
    ).toBeInTheDocument();
  });

  it('cuenta las reservas del cliente que ha hecho', async () => {
    getMyBookings.mockResolvedValue({ data: RESERVAS });

    pintar(<DashboardHomePage />);

    await screen.findByText(es.panel.accesosRapidos);
    expect(getMyBookings).toHaveBeenCalled();
    expect(getReceived).not.toHaveBeenCalled();
    // La cancelada no entra en ninguno de los tres.
    expect(contador(es.estados.pendientes)).toBe('2');
    expect(contador(es.estados.confirmadas)).toBe('1');
    expect(contador(es.estados.completadas)).toBe('1');
  });

  it('las del profesional son las que ha recibido', async () => {
    usuario = PROFESIONAL;
    getReceived.mockResolvedValue({
      data: [reserva('b9', BookingStatus.CONFIRMED, 'Poda del jardín')],
    });

    pintar(<DashboardHomePage />);

    await screen.findByText(es.panel.accesosRapidos);
    expect(getReceived).toHaveBeenCalled();
    expect(getMyBookings).not.toHaveBeenCalled();
    expect(contador(es.estados.pendientes)).toBe('0');
    expect(contador(es.estados.confirmadas)).toBe('1');
  });

  it('si no se han podido cargar, no enseña tres ceros', async () => {
    // Tres ceros son una afirmación: «no tienes nada». Un fallo de red no
    // autoriza a decirla.
    getMyBookings.mockRejectedValueOnce(SIN_RED);

    pintar(<DashboardHomePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(es.carga.error);
    expect(screen.queryByText(es.estados.pendientes)).toBeNull();
    // El saludo no depende de la carga: sigue ahí.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hola, Ana' }),
    ).toBeInTheDocument();
  });

  it('y al reintentar, si ya responde, los enseña', async () => {
    getMyBookings
      .mockRejectedValueOnce(SIN_RED)
      .mockResolvedValueOnce({ data: RESERVAS });
    pintar(<DashboardHomePage />);

    await userEvent.click(
      await screen.findByRole('button', { name: es.carga.reintentar }),
    );

    await screen.findByText(es.panel.accesosRapidos);
    expect(getMyBookings).toHaveBeenCalledTimes(2);
    expect(contador(es.estados.pendientes)).toBe('2');
  });

  it('con la sesión caducada, ofrece volver a entrar', async () => {
    getMyBookings.mockRejectedValueOnce(SESION_CADUCADA);

    pintar(<DashboardHomePage />);

    const aviso = await avisoDeSesion();
    expect(aviso).toHaveTextContent(es.carga.sesionCaducada);
    expect(
      within(aviso).getByRole('link', { name: es.carga.entrarDeNuevo }),
    ).toHaveAttribute('href', '/auth/login');
  });

  it('a la administración la manda a su panel', async () => {
    usuario = { id: 'u3', firstName: 'Eva', role: UserRole.ADMIN };

    const { container } = pintar(<DashboardHomePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
    expect(container).toBeEmptyDOMElement();
  });

  it('sin sesión todavía, no pinta nada', async () => {
    usuario = null;

    const { container } = pintar(<DashboardHomePage />);
    // La carga sale igualmente: se deja terminar para comprobar que, aun
    // con la respuesta, sigue sin pintar nada.
    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('Mis reservas', () => {
  const pestaña = (nombre: string) =>
    userEvent.click(screen.getByRole('button', { name: nombre }));

  const titulos = () =>
    screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

  it('lista las del cliente, cada una con su enlace al detalle', async () => {
    getMyBookings.mockResolvedValue({ data: RESERVAS });

    pintar(<MyBookingsPage />);

    await screen.findByText('Fontanería urgente');
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: es.reservasPanel.misReservas,
      }),
    ).toBeInTheDocument();
    expect(titulos()).toHaveLength(RESERVAS.length);
    expect(enlaces()).toEqual(
      RESERVAS.map((r) => `/dashboard/bookings/${r.id}`),
    );
    // Quien la ve es el cliente: la otra parte es el profesional.
    expect(screen.getAllByText('Luis Gómez')).toHaveLength(RESERVAS.length);
  });

  it('las pestañas filtran por estado', async () => {
    getMyBookings.mockResolvedValue({ data: RESERVAS });
    pintar(<MyBookingsPage />);
    await screen.findByText('Fontanería urgente');

    await pestaña(es.estados.pendientes);
    expect(titulos()).toEqual(['Fontanería urgente', 'Pintar el salón']);

    await pestaña(es.estados.confirmadas);
    expect(titulos()).toEqual(['Clases de guitarra']);

    await pestaña(es.estados.completadas);
    expect(titulos()).toEqual(['Limpieza a fondo']);

    await pestaña(es.estados.todas);
    expect(titulos()).toHaveLength(RESERVAS.length);
    // Filtrar es cosa de la pantalla: la lista se pidió una sola vez.
    expect(getMyBookings).toHaveBeenCalledTimes(1);
  });

  it('una pestaña vacía lo dice, en lugar de quedarse en blanco', async () => {
    getMyBookings.mockResolvedValue({ data: [RESERVAS[0]] });
    pintar(<MyBookingsPage />);
    await screen.findByText('Fontanería urgente');

    await pestaña(es.estados.confirmadas);

    expect(screen.getByText(es.reservasPanel.sinReservas)).toBeInTheDocument();
    expect(screen.queryByText('Fontanería urgente')).toBeNull();
  });

  it('sin ninguna reserva, lo dice', async () => {
    pintar(<MyBookingsPage />);

    expect(
      await screen.findByText(es.reservasPanel.sinReservas),
    ).toBeInTheDocument();
  });

  it('si falla la carga, no dice que no hay reservas y deja reintentar', async () => {
    // Quien reservó ayer y entra hoy con la red caída leía «no tienes
    // reservas».
    getMyBookings
      .mockRejectedValueOnce(SIN_RED)
      .mockResolvedValueOnce({ data: RESERVAS });
    pintar(<MyBookingsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(es.carga.error);
    expect(screen.queryByText(es.reservasPanel.sinReservas)).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: es.carga.reintentar }),
    );

    expect(await screen.findByText('Fontanería urgente')).toBeInTheDocument();
    expect(getMyBookings).toHaveBeenCalledTimes(2);
  });

  it('con la sesión caducada, ofrece volver a entrar', async () => {
    getMyBookings.mockRejectedValueOnce(SESION_CADUCADA);

    pintar(<MyBookingsPage />);

    const aviso = await avisoDeSesion();
    expect(aviso).toHaveTextContent(es.carga.sesionCaducada);
    expect(
      within(aviso).getByRole('link', { name: es.carga.entrarDeNuevo }),
    ).toHaveAttribute('href', '/auth/login');
    expect(screen.queryByText(es.reservasPanel.sinReservas)).toBeNull();
  });
});

describe('Mensajes', () => {
  const HACE_DOS_HORAS = new Date(Date.now() - 2 * 3_600_000).toISOString();

  const conversacion = (
    partnerId: string,
    nombre: string,
    apellido: string,
    contenido: string,
    unreadCount: number,
  ) => ({
    partnerId,
    partner: { id: partnerId, firstName: nombre, lastName: apellido },
    lastMessage: {
      id: `m-${partnerId}`,
      content: contenido,
      createdAt: HACE_DOS_HORAS,
    },
    unreadCount,
  });

  const CONVERSACIONES = [
    conversacion('u2', 'Luis', 'Gómez', '¿Le va bien el martes?', 3),
    conversacion('u3', 'Marta', 'Ibáñez', 'Gracias, todo perfecto', 0),
  ];

  it('cada conversación enlaza con la suya y enseña el último mensaje', async () => {
    getConversations.mockResolvedValue({ data: CONVERSACIONES });

    pintar(<MessagesPage />);

    await screen.findByText('¿Le va bien el martes?');
    expect(
      screen.getByRole('heading', { level: 1, name: es.mensajesPanel.titulo }),
    ).toBeInTheDocument();
    expect(enlaces()).toEqual([
      '/dashboard/messages/u2',
      '/dashboard/messages/u3',
    ]);
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    expect(screen.getByText('Marta Ibáñez')).toBeInTheDocument();
    expect(screen.getByText('Gracias, todo perfecto')).toBeInTheDocument();
  });

  it('el último mensaje toma la dirección de su propio texto', async () => {
    // Lo escribe la otra persona, en su idioma: uno en árabe tiene que
    // leerse de derecha a izquierda aunque la interfaz esté en español.
    getConversations.mockResolvedValue({
      data: [
        conversacion('u4', 'Karim', 'Haddad', 'مرحبا، هل أنت متاح غدا؟', 1),
      ],
    });

    pintar(<MessagesPage />);

    expect(await screen.findByText('مرحبا، هل أنت متاح غدا؟')).toHaveAttribute(
      'dir',
      'auto',
    );
  });

  it('cuenta los no leídos, y sin ninguno no pone contador', async () => {
    getConversations.mockResolvedValue({ data: CONVERSACIONES });

    pintar(<MessagesPage />);

    await screen.findByText('¿Le va bien el martes?');
    const [conLuis, conMarta] = screen.getAllByRole('link');
    expect(within(conLuis).getByText('3')).toBeInTheDocument();
    expect(within(conMarta).queryByText('0')).toBeNull();
  });

  it('la hora del último mensaje es relativa y en el idioma de quien mira', async () => {
    getConversations.mockResolvedValue({ data: [CONVERSACIONES[0]] });

    const { unmount } = pintar(<MessagesPage />);
    expect(
      await screen.findByText('hace alrededor de 2 horas'),
    ).toBeInTheDocument();
    unmount();

    pintar(<MessagesPage />, 'en');
    expect(await screen.findByText('about 2 hours ago')).toBeInTheDocument();
  });

  it('sin conversaciones, lo dice y explica cómo empezar una', async () => {
    pintar(<MessagesPage />);

    expect(
      await screen.findByText(es.mensajesPanel.sinConversaciones),
    ).toBeInTheDocument();
    expect(
      screen.getByText(es.mensajesPanel.sinConversacionesPista),
    ).toBeInTheDocument();
  });

  it('si falla la carga, no dice que no hay conversaciones', async () => {
    getConversations.mockRejectedValueOnce(SIN_RED);

    pintar(<MessagesPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(es.carga.error);
    expect(screen.queryByText(es.mensajesPanel.sinConversaciones)).toBeNull();
  });

  it('con la sesión caducada, ofrece volver a entrar', async () => {
    getConversations.mockRejectedValueOnce(SESION_CADUCADA);

    pintar(<MessagesPage />);

    const aviso = await avisoDeSesion();
    expect(aviso).toHaveTextContent(es.carga.sesionCaducada);
    expect(
      within(aviso).getByRole('link', { name: es.carga.entrarDeNuevo }),
    ).toHaveAttribute('href', '/auth/login');
  });
});
