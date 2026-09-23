import { test, expect, APIRequestContext } from '@playwright/test';
import { entrarComo } from './ayudas';

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
) {
  const busqueda = await peticion.get(`${API}/services/search?limit=50`);
  const { data } = await busqueda.json();
  const servicio = data.find(
    (s: { providerId: string }) => s.providerId === profesional.id,
  );
  expect(servicio, 'el profesional de demostración tiene servicios').toBeTruthy();

  const creada = await peticion.post(`${API}/bookings`, {
    headers: { Authorization: `Bearer ${cliente.token}` },
    data: {
      serviceId: servicio.id,
      scheduledDate: '2027-01-15T10:00:00.000Z',
      description: 'Reserva de la comprobación del circuito.',
      totalPrice: servicio.priceMin,
    },
  });
  expect(creada.ok(), 'la reserva se crea').toBeTruthy();
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

    const salto = await request.patch(
      `${API}/bookings/${reserva.id}/status`,
      {
        headers: { Authorization: `Bearer ${profesional.token}` },
        data: { status: 'completed' },
      },
    );

    expect(salto.status()).toBe(400);
  });

  test('aceptada y completada, con sus fechas', async ({ request }) => {
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');
    const reserva = await reservaPendiente(request, cliente, profesional);

    const aceptada = await request.patch(
      `${API}/bookings/${reserva.id}/status`,
      {
        headers: { Authorization: `Bearer ${profesional.token}` },
        data: { status: 'confirmed' },
      },
    );
    expect((await aceptada.json()).confirmedAt).toBeTruthy();

    const completada = await request.patch(
      `${API}/bookings/${reserva.id}/status`,
      {
        headers: { Authorization: `Bearer ${profesional.token}` },
        data: { status: 'completed' },
      },
    );
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
