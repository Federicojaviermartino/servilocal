import Stripe from 'stripe';
import type { DataSource } from 'typeorm';
import { SECRETO_DEL_AVISO, arrancarAplicacion } from './aplicacion';

/**
 * El aviso de Stripe, por HTTP y con su firma.
 *
 * Es la única puerta que mueve dinero sin sesión, y lo que la protege es la
 * firma, que se calcula sobre el cuerpo tal como llegó. Las pruebas del
 * controlador sustituían la verificación por un doble y las de pagos
 * llamaban al servicio sin pasar por HTTP: si la aplicación dejaba de
 * guardar el cuerpo sin interpretar, todos los avisos darían 400 en
 * producción, ninguna retención llegaría a anotarse y aquí seguiría todo en
 * verde.
 */
describe('El aviso de Stripe, con la aplicación montada', () => {
  let base: string;
  let fuente: DataSource;
  let cerrar: () => Promise<void>;
  let pago: string;

  const INTENCION = `pi_aviso_${Date.now()}`;
  // Solo para firmar: no llama a Stripe.
  const firmador = new Stripe('sk_test_solo_para_firmar');

  beforeAll(async () => {
    ({ base, fuente, cerrar } = await arrancarAplicacion());

    // Una reserva abierta de la semilla, con un pago a la espera de que el
    // cliente termine en Stripe.
    const [reserva] = await fuente.query(
      `SELECT b.id, b."clientId", b."totalPrice" FROM bookings b
       WHERE b.status = 'pending'
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p."bookingId" = b.id)
       ORDER BY b.id LIMIT 1`,
    );
    [{ id: pago }] = await fuente.query(
      `INSERT INTO payments
         ("bookingId", "clientId", amount, status, "stripePaymentIntentId")
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id`,
      [reserva.id, reserva.clientId, reserva.totalPrice, INTENCION],
    );
  });

  beforeEach(async () => {
    await fuente.query(
      `UPDATE payments SET status = 'pending', "paidAt" = NULL WHERE id = $1`,
      [pago],
    );
  });

  afterAll(async () => {
    if (fuente?.isInitialized && pago) {
      await fuente.query(`DELETE FROM payments WHERE id = $1`, [pago]);
    }
    await cerrar?.();
  });

  /** El aviso de que el dinero ya está retenido, como lo manda Stripe. */
  const retenido = () =>
    JSON.stringify({
      id: 'evt_prueba',
      object: 'event',
      type: 'payment_intent.amount_capturable_updated',
      data: { object: { id: INTENCION, object: 'payment_intent' } },
    });

  const firmar = (cuerpo: string, secreto = SECRETO_DEL_AVISO) =>
    firmador.webhooks.generateTestHeaderString({
      payload: cuerpo,
      secret: secreto,
    });

  const enviar = (cuerpo: string, firma?: string) =>
    fetch(`${base}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(firma && { 'stripe-signature': firma }),
      },
      body: cuerpo,
    });

  const estado = async () => {
    const [fila] = await fuente.query(
      `SELECT status, "paidAt" FROM payments WHERE id = $1`,
      [pago],
    );
    return fila as { status: string; paidAt: Date | null };
  };

  it('con su firma, anota la retención', async () => {
    const cuerpo = retenido();

    const respuesta = await enviar(cuerpo, firmar(cuerpo));

    expect(respuesta.status).toBe(201);
    expect(await respuesta.json()).toEqual({ received: true });
    expect(await estado()).toMatchObject({
      status: 'held',
      paidAt: expect.any(Date),
    });
  });

  it('la firma es del cuerpo exacto: con un espacio de más ya no vale', async () => {
    // Lo mismo, interpretado y vuelto a escribir, son otros bytes. Es lo
    // que pasaría si se verificara contra el cuerpo ya interpretado.
    const cuerpo = retenido();

    const respuesta = await enviar(`${cuerpo} `, firmar(cuerpo));

    expect(respuesta.status).toBe(400);
    expect((await estado()).status).toBe('pending');
  });

  it('firmado con otro secreto no mueve nada', async () => {
    const cuerpo = retenido();

    const respuesta = await enviar(cuerpo, firmar(cuerpo, 'whsec_de_otro'));

    expect(respuesta.status).toBe(400);
    expect((await estado()).status).toBe('pending');
  });

  it('sin firma, tampoco', async () => {
    const respuesta = await enviar(retenido());

    expect(respuesta.status).toBe(400);
    expect((await estado()).status).toBe('pending');
  });

  it('una ráfaga de avisos no choca con el límite de peticiones', async () => {
    // Stripe llama desde unas pocas direcciones, y lo que lo autentica es
    // la firma. Con el límite general, de 120 por minuto, la ráfaga recibía
    // un 429 y Stripe la reintentaba cada vez más tarde.
    const cuerpo = retenido();
    const firma = firmar(cuerpo);

    const estados = new Set<number>();
    for (let i = 0; i < 130; i++) {
      const respuesta = await enviar(cuerpo, firma);
      await respuesta.arrayBuffer();
      estados.add(respuesta.status);
    }

    expect([...estados]).toEqual([201]);
  });
});
