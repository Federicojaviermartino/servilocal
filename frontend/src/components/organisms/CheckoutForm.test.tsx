import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../../../messages/es.json';
import CheckoutForm from './CheckoutForm';

/**
 * El formulario que mueve el dinero.
 *
 * Todo lo que hay aquí se decide después de que Stripe conteste, y de lo que
 * se haga con esa respuesta depende que el cliente vea «retenido» cuando no
 * lo está, o que se quede sin saber por qué le han rechazado la tarjeta. Son
 * ramas que en producción solo se recorren cuando algo va mal, que es
 * justamente cuando nadie está mirando.
 */
const confirmPayment = vi.fn();
const confirmar = vi.fn();
const empujar = vi.fn();
const avisoError = vi.fn();
const avisoExito = vi.fn();
const aviso = vi.fn();

vi.mock('@stripe/react-stripe-js', () => ({
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({}),
  PaymentElement: () => <div data-testid="stripe-elements" />,
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: empujar }),
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign((m: string) => aviso(m), {
    error: (m: string) => avisoError(m),
    success: (m: string) => avisoExito(m),
  });
  return { default: toast };
});

vi.mock('@/lib/api', () => ({
  paymentsApi: { confirm: (id: string) => confirmar(id) },
}));

function pintar(alCaducar?: () => Promise<void>) {
  render(
    <NextIntlClientProvider locale="es" messages={es as never}>
      <CheckoutForm
        bookingId="b1"
        paymentIntentId="pi_123"
        amount={65}
        onIntentExpired={alCaducar}
      />
    </NextIntlClientProvider>,
  );
}

const pagar = () =>
  userEvent.click(screen.getByRole('button', { name: /Retener/ }));

describe('CheckoutForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmar.mockResolvedValue({ data: {} });
  });

  it('una retención aceptada se confirma contra el servidor y lleva a la lista', async () => {
    // `requires_capture` es el estado normal aquí: el cobro es manual, así
    // que Stripe retiene y no cobra. Tratarlo como un fallo dejaría el
    // importe retenido sin que nadie lo hubiera registrado.
    confirmPayment.mockResolvedValue({
      paymentIntent: { status: 'requires_capture' },
    });
    pintar();

    await pagar();

    await waitFor(() => expect(confirmar).toHaveBeenCalledWith('pi_123'));
    expect(avisoExito).toHaveBeenCalledWith(es.pago.completado);
    expect(empujar).toHaveBeenCalledWith('/dashboard/bookings?confirmed=b1');
  });

  it('y un cobro inmediato también', async () => {
    confirmPayment.mockResolvedValue({
      paymentIntent: { status: 'succeeded' },
    });
    pintar();

    await pagar();

    await waitFor(() => expect(confirmar).toHaveBeenCalledWith('pi_123'));
  });

  it('si el banco pide verificación, no se da por pagado', async () => {
    // Stripe devuelve la intención sin error pero a medio camino. Confirmarla
    // aquí diría que hay dinero retenido cuando todavía no lo hay.
    confirmPayment.mockResolvedValue({
      paymentIntent: { status: 'requires_action' },
    });
    pintar();

    await pagar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retener/ })).toBeEnabled(),
    );
    expect(confirmar).not.toHaveBeenCalled();
    expect(empujar).not.toHaveBeenCalled();
  });

  it('si el servidor no registra la retención, no se dice que todo fue bien', async () => {
    // El dinero está retenido en Stripe y aquí no consta. Mandar al cliente a
    // la lista con un «completado» sería esconder justo el caso en el que
    // hace falta que alguien mire.
    confirmPayment.mockResolvedValue({
      paymentIntent: { status: 'requires_capture' },
    });
    confirmar.mockRejectedValue(new Error('500'));
    pintar();

    await pagar();

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(es.pago.noConfirmado),
    );
    expect(avisoExito).not.toHaveBeenCalled();
    expect(empujar).not.toHaveBeenCalled();
  });

  it('una tarjeta rechazada se explica en el idioma de quien paga', async () => {
    // Stripe contesta «Your card was declined» en inglés y con jerga de
    // pasarela.
    confirmPayment.mockResolvedValue({
      error: { code: 'card_declined', message: 'Your card was declined.' },
    });
    pintar();

    await pagar();

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(es.pago.rechazada),
    );
    expect(avisoError).not.toHaveBeenCalledWith('Your card was declined.');
    expect(empujar).not.toHaveBeenCalled();
  });

  it('cada motivo conocido tiene el suyo', async () => {
    const CASOS: [string, string][] = [
      ['expired_card', es.pago.tarjetaCaducada],
      ['incorrect_cvc', es.pago.cvcIncorrecto],
      ['insufficient_funds', es.pago.fondosInsuficientes],
      ['authentication_required', es.pago.verificacion],
      ['processing_error', es.pago.errorTemporal],
    ];

    for (const [codigo, esperado] of CASOS) {
      vi.clearAllMocks();
      confirmPayment.mockResolvedValue({ error: { code: codigo } });
      const { unmount } = render(
        <NextIntlClientProvider locale="es" messages={es as never}>
          <CheckoutForm bookingId="b1" paymentIntentId="pi_123" amount={65} />
        </NextIntlClientProvider>,
      );

      await pagar();

      await waitFor(() => expect(avisoError).toHaveBeenCalledWith(esperado));
      unmount();
    }
  });

  it('un motivo que no conocemos usa lo que diga Stripe antes que un genérico', async () => {
    // Un mensaje concreto en inglés ayuda más que «Error procesando el pago»,
    // y además deja ver qué código nuevo ha aparecido.
    confirmPayment.mockResolvedValue({
      error: { code: 'un_codigo_nuevo', message: 'Something specific.' },
    });
    pintar();

    await pagar();

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith('Something specific.'),
    );
  });

  it('y si Stripe tampoco dice nada, queda el genérico', async () => {
    confirmPayment.mockResolvedValue({ error: {} });
    pintar();

    await pagar();

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(es.pago.errorGenerico),
    );
  });

  it('una sesión de pago caducada se regenera sin cobrar dos veces', async () => {
    // Pasa al dejar la pestaña abierta un rato. Reintentar con la intención
    // vieja da error; lo que toca es pedir otra, no avisar de un fallo.
    confirmPayment.mockResolvedValue({
      error: { code: 'payment_intent_unexpected_state' },
    });
    const alCaducar = vi.fn(async () => {});
    pintar(alCaducar);

    await pagar();

    await waitFor(() => expect(alCaducar).toHaveBeenCalledTimes(1));
    expect(aviso).toHaveBeenCalledWith(es.pago.caducada);
    expect(avisoError).not.toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
    expect(empujar).not.toHaveBeenCalled();
  });

  it('y si tampoco se puede regenerar, se dice y el botón vuelve a estar vivo', async () => {
    // Dejar el botón girando para siempre es la peor salida: no hay nada que
    // esperar y no hay nada que pulsar.
    confirmPayment.mockResolvedValue({
      error: { code: 'payment_intent_unexpected_state' },
    });
    pintar(vi.fn(async () => Promise.reject(new Error('sin red'))));

    await pagar();

    await waitFor(() =>
      expect(avisoError).toHaveBeenCalledWith(es.pago.noRegenerar),
    );
    expect(screen.getByRole('button', { name: /Retener/ })).toBeEnabled();
  });

  it('mientras el pago está en curso no se puede volver a pulsar', async () => {
    // Dos confirmaciones seguidas son dos retenciones sobre la misma tarjeta.
    let resolver: (v: unknown) => void = () => {};
    confirmPayment.mockReturnValue(
      new Promise((r) => {
        resolver = r;
      }),
    );
    pintar();

    await pagar();

    const boton = screen.getByRole('button', { name: es.comun.cargando });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(boton);
    expect(confirmPayment).toHaveBeenCalledTimes(1);

    resolver({ paymentIntent: { status: 'requires_capture' } });
    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
  });

  it('el importe se enseña con sus dos decimales', async () => {
    // 65 euros escrito «65» al lado de un botón de pago se lee como un
    // borrador.
    pintar();

    expect(
      screen.getByRole('button', { name: 'Retener 65.00 euros' }),
    ).toBeInTheDocument();
    expect(screen.getByText('65.00 euros')).toBeInTheDocument();
  });
});
