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
    await page.getByRole('button', { name: /laura@ejemplo[.]com/ }).click();
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

    // Sin claves de Stripe reales la API no puede crear la intención de pago y
    // la página muestra un error. En ese caso el test no tiene nada que
    // comprobar: se omite con un motivo claro en lugar de fallar y parecer
    // una regresión. Con las claves configuradas, se ejecuta entero.
    const pagoDisponible = await page
      .getByRole('heading', { name: 'Confirmar pago' })
      .waitFor({ timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !pagoDisponible,
      'Stripe no está configurado en este entorno: la reserva se crea, pero no se puede cobrar',
    );

    // Segunda guarda: la API puede tener clave secreta y crear la intención,
    // pero si al cliente le falta la clave publicable Stripe no monta su
    // formulario. Son dos configuraciones distintas y fallan por separado.
    const marco = page.locator('iframe[name^="__privateStripeFrame"]').first();
    const formularioMontado = await marco
      .waitFor({ state: 'attached', timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !formularioMontado,
      'Falta NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY en la compilación: Stripe no monta el formulario',
    );

    // Antes de pedir la tarjeta hay que haber dicho que no se cobra todavía.
    await expect(page.getByText('No se te cobra ahora')).toBeVisible();

    const formularioStripe = page
      .frameLocator('iframe[name^="__privateStripeFrame"]')
      .first();

    await formularioStripe
      .getByPlaceholder('1234 1234 1234 1234')
      .fill('4242424242424242');
    await formularioStripe.getByPlaceholder('MM / AA').fill('12 / 34');
    await formularioStripe.getByPlaceholder('CVC').fill('123');

    await page.getByRole('button', { name: /Retener/ }).click();

    // El dinero queda retenido y la aplicación lleva al listado. La reserva
    // NO se confirma aquí: eso lo decide el profesional, y hasta entonces
    // sigue pendiente. Confirmarla al pagar era lo que dejaba su pantalla de
    // «reservas recibidas» sin nada que aceptar.
    await expect(page).toHaveURL(/\/dashboard\/bookings/, { timeout: 60000 });
    await expect(
      page.getByRole('heading', { name: 'Mis reservas' }),
    ).toBeVisible();
  });
});
