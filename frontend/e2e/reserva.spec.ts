import { test, expect } from '@playwright/test';

const TARJETA = 'a[href^="/services/"]:not([href*="search"])';

/**
 * Si este entorno tiene claves de prueba de Stripe, las dos: la secreta para
 * la API y la publicable, que Next incrusta al compilar.
 *
 * Se decide antes de empezar, por el entorno. Antes se decidía mirando si la
 * página llegaba a enseñar el formulario, y entonces cualquier fallo con las
 * claves puestas —una política de seguridad que bloqueara a Stripe, un 500
 * al preparar el pago— salía como prueba omitida, y la CI en verde.
 */
const CON_STRIPE =
  (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_') &&
  process.env.STRIPE_SECRET_KEY !== 'sk_test_marcador' &&
  (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test_');

/**
 * Recorrido completo: entrar, elegir servicio, reservar y pagar.
 *
 * Usa la tarjeta de pruebas de Stripe, así que no genera ningún cargo real,
 * pero sí crea una reserva en la base de datos de la demostración.
 */
test.describe('Reserva y pago', () => {
  // Stripe tarda en montar su formulario dentro del iframe.
  test.slow();
  test.skip(
    !CON_STRIPE,
    'Sin claves de prueba de Stripe (STRIPE_SECRET_KEY y NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) no hay nada que cobrar',
  );

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

    await expect(page).toHaveURL(/\/bookings\/[^/]+\/payment$/);
    const reserva = new URL(page.url()).pathname.split('/').at(-2);

    // Con las claves puestas, el formulario tiene que salir. Si no sale, es
    // un fallo: la página, la API o Stripe.
    await expect(
      page.getByRole('heading', { name: 'Confirmar pago' }),
    ).toBeVisible({ timeout: 25000 });
    await expect(
      page.locator('iframe[name^="__privateStripeFrame"]').first(),
    ).toBeAttached({ timeout: 25000 });

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

    // Lo que importa no es la pantalla, sino el dinero: retenido, no cobrado.
    const pago = await page.request.get(`/api/payments/booking/${reserva}`);
    expect(pago.ok()).toBe(true);
    expect(await pago.json()).toMatchObject({ status: 'held' });
  });
});
