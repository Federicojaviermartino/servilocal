import { test, expect } from '@playwright/test';

test.describe('Acceso a la aplicación', () => {
  test('el acceso de demostración entra como cliente', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByText('Acceso de demostración')).toBeVisible();

    await page.getByRole('button', { name: 'Cliente', exact: true }).click();

    // Se comprueba en el panel y no en la cabecera: en móvil el nombre queda
    // dentro del menú plegado y no sería visible.
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await page.goto('/dashboard');
    await expect(
      page.getByRole('heading', { name: /Hola, Laura/ }),
    ).toBeVisible();
  });

  test('el acceso de demostración entra como profesional', async ({ page }) => {
    await page.goto('/auth/login');
    await page
      .getByRole('button', { name: 'Profesional', exact: true })
      .click();
    await expect(page).not.toHaveURL(/\/auth\/login/);

    await page.goto('/dashboard/services');
    await expect(
      page.getByRole('heading', { name: 'Mis servicios' }),
    ).toBeVisible();
  });

  test('unas credenciales incorrectas muestran el error y no entran', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Correo electrónico').fill('laura@ejemplo.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('el panel exige sesión', async ({ page }) => {
    await page.goto('/dashboard/bookings');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
