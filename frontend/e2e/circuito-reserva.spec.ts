import { test, expect, APIRequestContext } from '@playwright/test';
import { entrarComo, huecoLibre } from './ayudas';

const API = 'http://localhost:3001/api';

/**
 * Quién decide qué, y cuándo.
 *
 * Antes el webhook de pago confirmaba la reserva en cuanto el cliente pagaba,
 * así que el profesional se encontraba comprometido sin haber dicho que sí y
 * su pantalla de «reservas recibidas» no tenía nada que aceptar. Ahora pagar
 * solo retiene el dinero; aceptar, rechazar y completar son decisiones suyas,
 * y son las que mueven el importe.
 *
 * El cobro contra Stripe no se ejercita aquí: hace falta una clave de prueba
 * de verdad, y la comprobación de pago se salta sin ella. Lo que sí se
 * comprueba es la máquina de estados, que es donde vive la decisión.
 */
/**
 * /auth/token y no /auth/login: el acceso del navegador ya no devuelve el
 * token, lo deja en una cookie. Para hablar con la API desde aquí, como un
 * script, está esta otra ruta.
 */
async function entrar(peticion: APIRequestContext, email: string) {
  const respuesta = await peticion.post(`${API}/auth/token`, {
    data: { email, password: 'Password123!' },
  });
  const { accessToken, user } = await respuesta.json();
  return { token: accessToken as string, id: user.id as string };
}

async function reservaPendiente(
  peticion: APIRequestContext,
  cliente: { token: string },
  profesional: { id: string },
  fecha = huecoLibre(),
) {
  const busqueda = await peticion.get(`${API}/services/search?limit=50`);
  const { data } = await busqueda.json();
  const servicio = data.find(
    (s: { providerId: string }) => s.providerId === profesional.id,
  );
  expect(
    servicio,
    'el profesional de demostración tiene servicios',
  ).toBeTruthy();

  const creada = await peticion.post(`${API}/bookings`, {
    headers: { Authorization: `Bearer ${cliente.token}` },
    data: {
      serviceId: servicio.id,
      scheduledDate: fecha,
      description: 'Reserva de la comprobación del circuito.',
      totalPrice: servicio.priceMin,
    },
  });
  // Con la respuesta en el mensaje: un «false» a secas no dice si fue un
  // choque de agenda, un límite de peticiones o una sesión que no llegó.
  expect(
    creada.ok(),
    `la reserva se crea (${creada.status()}: ${await creada.text()})`,
  ).toBeTruthy();
  return creada.json();
}

test.describe('Quién decide sobre una reserva', () => {
  test('nace pendiente, esperando al profesional', async ({ request }) => {
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');

    const reserva = await reservaPendiente(request, cliente, profesional);

    expect(reserva.status).toBe('pending');
    expect(reserva.confirmedAt).toBeFalsy();
  });

  test('el profesional la ve en su bandeja y la acepta', async ({
    page,
    request,
  }) => {
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');
    await reservaPendiente(request, cliente, profesional);

    await entrarComo(page, 'profesional');
    await page.goto('/dashboard/bookings-received');

    // Si el pago la confirmara sola, aquí no habría nada que aceptar.
    const aceptar = page.getByRole('button', { name: /Aceptar/ }).first();
    await expect(aceptar).toBeVisible();
  });

  test('completar exige haber aceptado antes', async ({ request }) => {
    // Saltarse la aceptación permitiría dar por hecho un trabajo que nadie
    // se comprometió a hacer, y con él el cobro y la valoración.
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');
    const reserva = await reservaPendiente(request, cliente, profesional);

    const salto = await request.patch(`${API}/bookings/${reserva.id}/status`, {
      headers: { Authorization: `Bearer ${profesional.token}` },
      data: { status: 'completed' },
    });

    expect(salto.status()).toBe(400);
  });

  test('aceptada y completada, con sus fechas', async ({ request }) => {
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');
    // Crearla exige una fecha por venir y completarla, que haya llegado: se
    // reserva para dentro de unos segundos.
    const reserva = await reservaPendiente(
      request,
      cliente,
      profesional,
      new Date(Date.now() + 5000).toISOString(),
    );
    const completar = (datos: Record<string, unknown> = {}) =>
      request.patch(`${API}/bookings/${reserva.id}/status`, {
        headers: { Authorization: `Bearer ${profesional.token}` },
        data: { status: 'completed', ...datos },
      });

    const aceptada = await request.patch(
      `${API}/bookings/${reserva.id}/status`,
      {
        headers: { Authorization: `Bearer ${profesional.token}` },
        data: { status: 'confirmed' },
      },
    );
    expect((await aceptada.json()).confirmedAt).toBeTruthy();

    // Antes de su hora no se completa: sería cobrar un trabajo por hacer.
    const pronto = await completar();
    expect(pronto.status()).toBe(400);
    expect((await pronto.json()).codigo).toBe('antes-de-la-fecha');

    // Llegada la hora, y sin nada retenido, no se completa en silencio: la
    // API pregunta, con un código que la interfaz reconoce en cualquier
    // idioma.
    await expect
      .poll(async () => (await completar()).status(), {
        timeout: 20000,
        intervals: [1000],
      })
      .toBe(409);
    const sinPago = await completar();
    expect((await sinPago.json()).codigo).toBe('sin-pago-retenido');

    // Y si el profesional decide completarla sin cobro, se completa.
    const completada = await completar({ sinCobro: true });
    const final = await completada.json();
    expect(final.status).toBe('completed');
    expect(final.completedAt).toBeTruthy();
  });

  test('rechazarla guarda el motivo y la cierra', async ({ request }) => {
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');
    const reserva = await reservaPendiente(request, cliente, profesional);

    const rechazada = await request.patch(
      `${API}/bookings/${reserva.id}/status`,
      {
        headers: { Authorization: `Bearer ${profesional.token}` },
        data: {
          status: 'rejected',
          cancellationReason: 'Esa semana la tengo cerrada.',
        },
      },
    );

    const final = await rechazada.json();
    expect(final.status).toBe('rejected');
    expect(final.cancellationReason).toBe('Esa semana la tengo cerrada.');
    expect(final.cancelledAt).toBeTruthy();
  });

  test('una reserva cerrada ya no se mueve', async ({ request }) => {
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');
    const reserva = await reservaPendiente(request, cliente, profesional);

    await request.patch(`${API}/bookings/${reserva.id}/status`, {
      headers: { Authorization: `Bearer ${profesional.token}` },
      data: { status: 'rejected' },
    });

    const reintento = await request.patch(
      `${API}/bookings/${reserva.id}/status`,
      {
        headers: { Authorization: `Bearer ${profesional.token}` },
        data: { status: 'confirmed' },
      },
    );

    expect(reintento.status()).toBe(400);
  });
});
