import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { entrarComo } from './ayudas';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const CLAVE = 'Password123!';

async function entrar(peticion: APIRequestContext, email: string) {
  const respuesta = await peticion.post(`${API}/auth/login`, {
    data: { email, password: CLAVE },
  });
  expect(respuesta.ok()).toBeTruthy();
  const { accessToken, user } = await respuesta.json();
  return { token: accessToken as string, id: user.id as string };
}

/**
 * Un servicio del profesional de demostración.
 *
 * Hace falta que sea suyo: solo el profesional de una reserva puede
 * aceptarla, y coger el primero que devuelva la búsqueda daba un 403 que a
 * su vez dejaba pasar el test sin comprobar nada.
 */
async function servicioDe(peticion: APIRequestContext, providerId: string) {
  const respuesta = await peticion.get(`${API}/services/search?limit=50`);
  const { data } = await respuesta.json();
  const suyo = data.find(
    (s: { providerId: string }) => s.providerId === providerId,
  );
  expect(
    suyo,
    'el profesional de demostración tiene algún servicio',
  ).toBeTruthy();
  return suyo;
}

/** Crea una reserva y la acepta, comprobando que ambas cosas funcionan. */
async function reservaAceptada(
  peticion: APIRequestContext,
  cliente: { token: string },
  profesional: { token: string; id: string },
  fecha: string,
) {
  const servicio = await servicioDe(peticion, profesional.id);

  const creada = await peticion.post(`${API}/bookings`, {
    headers: { Authorization: `Bearer ${cliente.token}` },
    data: {
      serviceId: servicio.id,
      scheduledDate: fecha,
      description: 'Reserva creada por la comprobación automática de avisos.',
      totalPrice: servicio.priceMin,
    },
  });
  expect(creada.ok(), 'la reserva se crea').toBeTruthy();
  const reserva = await creada.json();

  const aceptada = await peticion.patch(
    `${API}/bookings/${reserva.id}/status`,
    {
      headers: { Authorization: `Bearer ${profesional.token}` },
      data: { status: 'confirmed' },
    },
  );
  // Sin esta comprobación el test pasaría con un aviso de una ejecución
  // anterior y no estaría verificando nada de lo que dice verificar.
  expect(aceptada.ok(), 'el profesional acepta la reserva').toBeTruthy();

  return reserva;
}

test.describe('Avisos', () => {
  test('aceptar una reserva avisa al cliente sin que recargue', async ({
    page,
    request,
  }) => {
    // El agujero que esto tapa: hasta ahora el cliente se enteraba de que le
    // habían aceptado la reserva únicamente si volvía a entrar a mirar.
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');
    const servicio = await servicioDe(request, profesional.id);

    const creada = await request.post(`${API}/bookings`, {
      headers: { Authorization: `Bearer ${cliente.token}` },
      data: {
        serviceId: servicio.id,
        scheduledDate: '2026-11-05T10:00:00.000Z',
        description: 'Reserva creada por la comprobación automática de avisos.',
        totalPrice: servicio.priceMin,
      },
    });
    expect(creada.ok(), 'la reserva se crea').toBeTruthy();
    const reserva = await creada.json();

    // El cliente mira la pantalla antes de que ocurra nada.
    await entrarComo(page, 'cliente');
    await page.goto('/dashboard');
    const campana = page.getByRole('button', { name: /Abrir los avisos/ });
    await expect(campana).toBeVisible();

    // El profesional acepta desde fuera, como haría en su propio navegador.
    const aceptada = await request.patch(
      `${API}/bookings/${reserva.id}/status`,
      {
        headers: { Authorization: `Bearer ${profesional.token}` },
        data: { status: 'confirmed' },
      },
    );
    expect(aceptada.ok(), 'el profesional acepta la reserva').toBeTruthy();

    // Sin recargar: el aviso entra por el mismo socket que los mensajes.
    await expect(
      page.getByRole('button', { name: /Abrir los avisos, \d+ sin leer/ }),
    ).toBeVisible({ timeout: 10000 });

    await campana.click();
    const panel = page.getByRole('dialog', { name: 'Avisos' });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText('Tu reserva ha sido confirmada.').first(),
    ).toBeVisible();
  });

  test('el texto del aviso va en el idioma del visitante', async ({
    page,
    request,
  }) => {
    // El servidor guarda el tipo y los datos, nunca la frase: si guardara
    // «Tu reserva ha sido confirmada» se quedaría en castellano para siempre.
    const cliente = await entrar(request, 'laura@ejemplo.com');
    const profesional = await entrar(request, 'carlos@ejemplo.com');
    await reservaAceptada(
      request,
      cliente,
      profesional,
      '2026-11-06T10:00:00.000Z',
    );

    await entrarComo(page, 'cliente');
    await page.goto('/de/dashboard');

    await page
      .getByRole('button', { name: /Benachrichtigungen öffnen/ })
      .click();
    const panel = page.getByRole('dialog', { name: 'Benachrichtigungen' });
    await expect(
      panel.getByText('Ihre Buchung wurde bestätigt.').first(),
    ).toBeVisible();
  });
});
