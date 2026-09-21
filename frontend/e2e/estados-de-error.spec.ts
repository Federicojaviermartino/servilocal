import { test, expect, Page } from '@playwright/test';
import { entrarComo } from './ayudas';

/** La caja de error de la pantalla, no el anunciador de rutas de Next. */
const cajaDeError = (page: Page) =>
  page.getByRole('alert').filter({ hasText: 'No se han podido cargar' });

/**
 * Qué se ve cuando la API no contesta.
 *
 * Diez pantallas trataban un fallo de red como una lista vacía, así que el
 * cliente que reservó ayer entraba hoy y leía «No tienes reservas». Estas
 * comprobaciones cortan la API de verdad y miran qué sale: es la única forma
 * de probarlo, porque con el servidor sano las dos ramas se ven igual.
 */
test.describe('Cuando la API no contesta', () => {
  test('un fallo del servidor no se cuenta como «no tienes nada»', async ({
    page,
  }) => {
    await entrarComo(page, 'cliente');

    await page.route('**/api/bookings/my', (ruta) =>
      ruta.fulfill({ status: 500, body: '{}' }),
    );
    await page.goto('/dashboard/bookings');

    await expect(cajaDeError(page)).toBeVisible();
    await expect(page.getByText('No tienes reservas')).toBeHidden();
  });

  test('y se puede reintentar sin recargar la página', async ({ page }) => {
    await entrarComo(page, 'cliente');

    // Falla la primera vez y responde bien la segunda: así se comprueba que
    // el botón vuelve a pedirlo de verdad y no solo limpia el cartel.
    let llamadas = 0;
    await page.route('**/api/bookings/my', (ruta) => {
      llamadas += 1;
      return llamadas === 1
        ? ruta.fulfill({ status: 503, body: '{}' })
        : ruta.continue();
    });
    await page.goto('/dashboard/bookings');
    await expect(cajaDeError(page)).toBeVisible();

    await page.getByRole('button', { name: /Reintentar/ }).click();

    await expect(cajaDeError(page)).toBeHidden();
    expect(llamadas).toBeGreaterThan(1);
  });

  test('una sesión caducada invita a entrar, no a reintentar', async ({
    page,
  }) => {
    // El token dura un día, así que este es el fallo más frecuente de todos.
    await entrarComo(page, 'cliente');

    await page.route('**/api/bookings/my', (ruta) =>
      ruta.fulfill({ status: 401, body: '{}' }),
    );
    await page.goto('/dashboard/bookings');

    await expect(page.getByText('Tu sesión ha caducado')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Volver a entrar' }),
    ).toHaveAttribute('href', '/auth/login');
    await expect(page.getByRole('button', { name: /Reintentar/ })).toBeHidden();
  });

  test('el perfil no se deja guardar con los campos en blanco', async ({
    page,
  }) => {
    // Este era el caso caro: la carga no tenía catch, el formulario quedaba
    // vacío con aspecto de estar listo, y guardar borraba el teléfono, la
    // biografía y la dirección de la propia persona.
    await entrarComo(page, 'cliente');

    await page.route('**/api/users/*', (ruta) =>
      ruta.fulfill({ status: 500, body: '{}' }),
    );
    await page.goto('/dashboard/profile');

    await expect(cajaDeError(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeHidden();
  });

  test('con la API sana se ve el contenido, no un error', async ({ page }) => {
    // Sin esto, las comprobaciones de arriba pasarían con una pantalla que
    // enseñara el error siempre.
    await entrarComo(page, 'cliente');
    await page.goto('/dashboard/bookings');

    await expect(cajaDeError(page)).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'Mis reservas' }),
    ).toBeVisible();
  });
});
