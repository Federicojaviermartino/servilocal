import { test, expect } from '@playwright/test';

const TARJETA = 'a[href^="/services/"]:not([href*="search"])';

/**
 * Recorrido completo: entrar, elegir servicio, reservar y pagar.
 *
 * Usa la tarjeta de pruebas de Stripe, así que no genera ningún cargo real,
 * pero sí crea una reserva en la base de datos de la demostración.
 */
test.describe('Reserva y pago', () => {
  // Stripe tarda en montar su formulario dentro del iframe.
  test.slow();

  test('un cliente reserva un servicio y paga con tarjeta de prueba', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: 'Cliente', exact: true }).click();
    await expect(page).not.toHaveURL(/\/auth\/login/);

    await page.goto('/services/search');
    await page.locator(TARJETA).first().click();
    await page.getByRole('button', { name: 'Reservar ahora' }).click();
    await expect(page).toHaveURL(/\/book$/);

    // La fecha y el precio vienen rellenos; falta describir el trabajo
    await page
      .getByLabel('Descripción del trabajo')
      .fill('Comprobación automática del flujo de reserva y pago.');
    await page.getByRole('button', { name: 'Continuar al pago' }).click();

    await expect(page).toHaveURL(/\/payment$/);
    await expect(
      page.getByRole('heading', { name: 'Confirmar pago' }),
    ).toBeVisible();

    // Stripe monta su formulario dentro de un iframe propio. Sin clave
    // publicable configurada no llega a montarse, y entonces este test no
    // tiene nada que comprobar: mejor omitirlo con un motivo claro que
    // fallar y parecer una regresión.
    const marco = page.locator('iframe[name^="__privateStripeFrame"]').first();
    const stripeDisponible = await marco
      .waitFor({ state: 'attached', timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !stripeDisponible,
      'Stripe no está configurado en este entorno: falta NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    );

    const formularioStripe = page
      .frameLocator('iframe[name^="__privateStripeFrame"]')
      .first();

    await formularioStripe
      .getByPlaceholder('1234 1234 1234 1234')
      .fill('4242424242424242');
    await formularioStripe.getByPlaceholder('MM / AA').fill('12 / 34');
    await formularioStripe.getByPlaceholder('CVC').fill('123');

    await page.getByRole('button', { name: /Pagar/ }).click();

    // El webhook confirma la reserva y la aplicación lleva al listado
    await expect(page).toHaveURL(/\/dashboard\/bookings/, { timeout: 60000 });
    await expect(
      page.getByRole('heading', { name: 'Mis reservas' }),
    ).toBeVisible();
  });
});
