import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import { formatearImporte } from '@/lib/importes';
import PagosSection from './pagos';

const pedirPagos = vi.fn();
const cobrar = vi.fn();
const soltar = vi.fn();
const cambiarEstado = vi.fn();
const avisoExito = vi.fn();
const avisoError = vi.fn();

vi.mock('@/lib/api', () => ({
  adminApi: { pagos: () => pedirPagos() },
  paymentsApi: {
    capture: (reserva: string) => cobrar(reserva),
    refund: (reserva: string) => soltar(reserva),
  },
  bookingsApi: {
    updateStatus: (reserva: string, estado: string) =>
      cambiarEstado(reserva, estado),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: (m: string) => avisoExito(m),
    error: (m: string) => avisoError(m),
  }),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  usePathname: () => '/admin',
}));

let soloLectura = false;
vi.mock('@/lib/auth-store', () => ({
  useAuthStore: (seleccionar: (estado: object) => unknown) =>
    seleccionar({ user: { soloLectura } }),
}));

const A = es.administracion;

/** El importe como lo escribe la página, con su espacio duro. */
const IMPORTE = formatearImporte(75.5, 'es', true);

const pago = (extra: Record<string, unknown> = {}) => ({
  motivo: 'retenido-con-reserva-cerrada',
  reservaId: 'aaaaaaaa-1111-4111-8111-111111111111',
  estadoReserva: 'completed',
  fecha: '2026-10-01T10:00:00.000Z',
  estadoPago: 'held',
  importe: 75.5,
  servicio: 'Reparación de grifos',
  cliente: 'Laura García',
  profesional: 'Carlos Ruiz',
  ...extra,
});

const CERRADA = pago();
const CANCELADA = pago({
  reservaId: 'bbbbbbbb-2222-4222-8222-222222222222',
  estadoReserva: 'cancelled',
});
const SIN_CERRAR = pago({
  motivo: 'retenido-sin-completar',
  reservaId: 'cccccccc-3333-4333-8333-333333333333',
  estadoReserva: 'confirmed',
});
const SIN_COBRAR = pago({
  motivo: 'completada-sin-cobrar',
  reservaId: 'dddddddd-4444-4444-8444-444444444444',
  estadoPago: null,
  importe: 80,
});

const respuesta = (pagos: object[], totales: Record<string, number> = {}) => ({
  data: {
    pagos,
    totales: {
      'retenido-con-reserva-cerrada': 0,
      'retenido-sin-completar': 0,
      'completada-sin-cobrar': 0,
      ...totales,
    },
  },
});

const TODOS = respuesta([CERRADA, CANCELADA, SIN_CERRAR, SIN_COBRAR], {
  'retenido-con-reserva-cerrada': 2,
  'retenido-sin-completar': 1,
  'completada-sin-cobrar': 1,
});

async function pintar(idioma = 'es', mensajes: object = es) {
  render(
    <NextIntlClientProvider locale={idioma} messages={mensajes as never}>
      <PagosSection />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(pedirPagos).toHaveBeenCalled());
}

/** La tarjeta de un pago, por el principio del identificador de su reserva. */
const tarjeta = async (reserva: { reservaId: string }) =>
  (await screen.findByText(new RegExp(reserva.reservaId.slice(0, 8)))).closest(
    'li',
  ) as HTMLElement;

const botonesDe = (elemento: HTMLElement) =>
  within(elemento)
    .queryAllByRole('button')
    .map((boton) => boton.textContent);

const confirmar = (respuestaDada: boolean) =>
  vi.spyOn(window, 'confirm').mockReturnValue(respuestaDada);

beforeEach(() => {
  vi.resetAllMocks();
  soloLectura = false;
  pedirPagos.mockResolvedValue(TODOS);
  cobrar.mockResolvedValue({ data: {} });
  soltar.mockResolvedValue({ data: {} });
  cambiarEstado.mockResolvedValue({ data: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Los pagos por revisar del panel', () => {
  it('cada pago dice por qué está ahí, cuánto es, de quién y de qué reserva', async () => {
    await pintar();
    const cerrada = await tarjeta(CERRADA);

    expect(within(cerrada).getByText(A.motivoRetenidoCerrada)).toBeVisible();
    expect(within(cerrada).getByText('75,50 €')).toBeVisible();
    expect(within(cerrada).getByText('Reparación de grifos')).toBeVisible();
    expect(
      within(cerrada).getByText(
        /Cliente: Laura García · Proveedor: Carlos Ruiz/,
      ),
    ).toBeVisible();
    expect(within(cerrada).getByText(/aaaaaaaa · Completada · /)).toBeVisible();
    expect(
      within(cerrada).getByText(A.motivoRetenidoCerradaTexto),
    ).toBeVisible();
  });

  it('arriba va cuántos hay de cada tipo', async () => {
    await pintar();
    const resumen = await screen.findByRole('list', { name: A.pagosResumen });

    expect(
      within(resumen)
        .getAllByRole('listitem')
        .map((elemento) => elemento.textContent),
    ).toEqual([
      `${A.motivoRetenidoCerrada}: 2`,
      `${A.motivoRetenidoSinCompletar}: 1`,
      `${A.motivoCompletadaSinCobrar}: 1`,
    ]);
  });

  it('sin nada que revisar, lo dice', async () => {
    pedirPagos.mockResolvedValue(respuesta([]));

    await pintar();

    expect(await screen.findByText(A.sinPagos)).toBeVisible();
    expect(screen.queryByRole('list', { name: A.listaPagos })).toBeNull();
  });

  it('si hay más de los que caben, dice cuántos se ven y cuántos hay', async () => {
    pedirPagos.mockResolvedValue(
      respuesta([SIN_COBRAR], { 'completada-sin-cobrar': 79 }),
    );

    await pintar();

    expect(
      await screen.findByText('Se muestran los 1 más urgentes de 79.'),
    ).toBeVisible();
  });

  describe('qué se puede hacer con cada uno', () => {
    it('retenido con la reserva completada: cobrarlo', async () => {
      await pintar();

      expect(botonesDe(await tarjeta(CERRADA))).toEqual([A.cobrar]);
    });

    it('retenido con la reserva cancelada: soltarlo', async () => {
      await pintar();

      expect(botonesDe(await tarjeta(CANCELADA))).toEqual([A.soltarRetencion]);
    });

    it('retenido y con la reserva aún confirmada: cerrarla, en un sentido o en el otro', async () => {
      await pintar();

      expect(botonesDe(await tarjeta(SIN_CERRAR))).toEqual([
        A.completarYCobrar,
        A.cancelarYSoltar,
      ]);
    });

    it('completada sin cobrar: nada, que paga el cliente', async () => {
      await pintar();

      expect(botonesDe(await tarjeta(SIN_COBRAR))).toEqual([]);
    });
  });

  describe('al actuar', () => {
    it.each([
      [
        A.cobrar,
        CERRADA,
        A.confirmarCobrar.replace('{importe}', IMPORTE),
        A.pagoCobrado,
      ],
      [
        A.soltarRetencion,
        CANCELADA,
        A.confirmarSoltar.replace('{importe}', IMPORTE),
        A.retencionSoltada,
      ],
      [
        A.completarYCobrar,
        SIN_CERRAR,
        A.confirmarCompletar.replace('{importe}', IMPORTE),
        A.reservaCompletadaAdmin,
      ],
      [
        A.cancelarYSoltar,
        SIN_CERRAR,
        A.confirmarCancelarReserva.replace('{importe}', IMPORTE),
        A.reservaCanceladaAdmin,
      ],
    ])(
      '«%s» pregunta con el importe, lo hace, avisa y vuelve a pedir la lista',
      async (boton, reserva, pregunta, hecho) => {
        const confirmacion = confirmar(true);
        await pintar();

        await userEvent.click(
          within(await tarjeta(reserva)).getByRole('button', { name: boton }),
        );

        expect(confirmacion).toHaveBeenCalledWith(pregunta);
        await waitFor(() => expect(avisoExito).toHaveBeenCalledWith(hecho));
        expect(pedirPagos).toHaveBeenCalledTimes(2);
      },
    );

    it('cada botón llama a lo suyo, con la reserva', async () => {
      confirmar(true);
      await pintar();

      await userEvent.click(
        within(await tarjeta(CERRADA)).getByRole('button', { name: A.cobrar }),
      );
      await userEvent.click(
        within(await tarjeta(CANCELADA)).getByRole('button', {
          name: A.soltarRetencion,
        }),
      );
      await userEvent.click(
        within(await tarjeta(SIN_CERRAR)).getByRole('button', {
          name: A.completarYCobrar,
        }),
      );
      await userEvent.click(
        within(await tarjeta(SIN_CERRAR)).getByRole('button', {
          name: A.cancelarYSoltar,
        }),
      );

      await waitFor(() => expect(cambiarEstado).toHaveBeenCalledTimes(2));
      expect(cobrar).toHaveBeenCalledWith(CERRADA.reservaId);
      expect(soltar).toHaveBeenCalledWith(CANCELADA.reservaId);
      expect(cambiarEstado.mock.calls).toEqual([
        [SIN_CERRAR.reservaId, 'completed'],
        [SIN_CERRAR.reservaId, 'cancelled'],
      ]);
    });

    it('si se echa atrás en la pregunta, no se toca nada', async () => {
      confirmar(false);
      await pintar();

      await userEvent.click(
        within(await tarjeta(CERRADA)).getByRole('button', { name: A.cobrar }),
      );

      expect(cobrar).not.toHaveBeenCalled();
      expect(pedirPagos).toHaveBeenCalledTimes(1);
    });

    it('si Stripe no responde, lo dice con sus palabras y la lista se queda como estaba', async () => {
      confirmar(true);
      cobrar.mockRejectedValue({
        response: { status: 503, data: { codigo: 'pagos-no-disponibles' } },
      });
      await pintar();

      await userEvent.click(
        within(await tarjeta(CERRADA)).getByRole('button', { name: A.cobrar }),
      );

      await waitFor(() =>
        expect(avisoError).toHaveBeenCalledWith(
          es.erroresApi['pagos-no-disponibles'],
        ),
      );
      expect(avisoExito).not.toHaveBeenCalled();
      expect(pedirPagos).toHaveBeenCalledTimes(1);
      // Y se puede volver a intentar.
      expect(
        within(await tarjeta(CERRADA)).getByRole('button', { name: A.cobrar }),
      ).toBeEnabled();
    });

    it('otro fallo, con la frase de la pantalla', async () => {
      confirmar(true);
      soltar.mockRejectedValue({ response: { status: 500 } });
      await pintar();

      await userEvent.click(
        within(await tarjeta(CANCELADA)).getByRole('button', {
          name: A.soltarRetencion,
        }),
      );

      await waitFor(() => expect(avisoError).toHaveBeenCalledWith(A.errorPago));
    });
  });

  it('la cuenta de demostración lo ve todo y no puede tocar nada, y dice por qué', async () => {
    soloLectura = true;
    await pintar();

    for (const boton of within(await tarjeta(SIN_CERRAR)).getAllByRole(
      'button',
    )) {
      expect(boton).toBeDisabled();
      expect(boton).toHaveAttribute('title', A.soloLecturaTexto);
    }
  });

  it('en otro idioma, el título del servicio va marcado como castellano', async () => {
    // Lo escribió el profesional: sin marcarlo, un lector de pantalla lo
    // pronuncia en el idioma de la página.
    await pintar('en', en);

    expect(await screen.findAllByText('Reparación de grifos')).not.toHaveLength(
      0,
    );
    for (const titulo of screen.getAllByText('Reparación de grifos')) {
      expect(titulo).toHaveAttribute('lang', 'es');
    }
  });

  it('si no se pueden pedir, ofrece reintentar', async () => {
    pedirPagos.mockRejectedValue({ response: { status: 500 } });

    await pintar();

    expect(
      await screen.findByRole('button', { name: es.carga.reintentar }),
    ).toBeVisible();
  });
});
