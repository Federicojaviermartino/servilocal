import { test, expect, Page } from '@playwright/test';

/**
 * El botón de demostración entra y redirige a la portada. Hay que esperar a
 * que llegue: /admin rebota a la pantalla de acceso mientras no haya sesión
 * guardada, así que ir antes de tiempo deja el test en la página equivocada.
 */
async function entrarComo(page: Page, boton: string) {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: boton, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'));
}

test.describe('Panel de administración', () => {
  test('la cuenta de demostración lo ve todo y no puede tocar nada', async ({
    page,
  }) => {
    await entrarComo(page, 'Administración');
    await page.goto('/admin');

    await expect(
      page.getByRole('heading', { name: 'Panel de administración' }),
    ).toBeVisible();

    // El aviso va antes que el intento: el bloqueo es deliberado y tiene que
    // parecerlo, en lugar de sorprender con un error al pulsar.
    await expect(
      page.getByText('Cuenta de demostración, en solo lectura'),
    ).toBeVisible();

    // Las métricas son lo que da valor al panel: si no cargan, la demostración
    // no enseña nada aunque el aviso salga.
    await expect(page.getByLabel('Métricas de la plataforma')).toBeVisible();

    await page.getByRole('tab', { name: 'Usuarios' }).click();
    const botonesEstado = page.getByRole('button', {
      name: /^(Desactivar|Activar)$/,
    });
    await expect(botonesEstado.first()).toBeVisible();

    const total = await botonesEstado.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      await expect(botonesEstado.nth(i)).toBeDisabled();
    }
  });

  test('el consumo de IA se explica en lugar de mostrar ceros a secas', async ({
    page,
  }) => {
    await entrarComo(page, 'Administración');
    await page.goto('/admin');

    await page.getByRole('tab', { name: 'IA', exact: true }).click();
    await expect(page.getByText('Consumo del modelo')).toBeVisible();

    // La barra dice cuánto del tope se lleva gastado. Es la cifra que evita
    // sorpresas en la factura, así que tiene que estar siempre.
    await expect(
      page.getByRole('progressbar', { name: 'Gasto sobre el tope mensual' }),
    ).toBeVisible();

    // El estado se afirma siempre, con clave o sin ella: un cero sin motivo
    // se lee como una avería del panel. La rama condicional de más abajo
    // sería verde en vacío si el panel dejara de pintar el distintivo.
    const estado = page
      .getByText('Activa', { exact: true })
      .or(page.getByText('Inactiva', { exact: true }))
      .or(page.getByText('Tope alcanzado', { exact: true }));
    await expect(estado).toBeVisible();

    // Y apagada, además, se explica por qué.
    if (await page.getByText('Inactiva', { exact: true }).isVisible()) {
      await expect(page.getByText(/La capa está apagada/)).toBeVisible();
    }
  });

  test('un cliente acaba en su panel y no en el de administración', async ({
    page,
  }) => {
    await entrarComo(page, 'Cliente');
    await page.goto('/admin');

    // Se comprueba el destino y no solo la ausencia del título: si el acceso
    // fallara, «no se ve el panel» sería cierto por el motivo equivocado.
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
