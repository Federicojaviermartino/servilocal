import { test, expect } from '@playwright/test';

// El endpoint está limitado a 6 peticiones por minuto y por IP. Estos tests
// hacen dos, de una en una, para no gastar el cupo y provocar un 429 que
// parecería un fallo del asistente.
test.describe.configure({ mode: 'serial' });

const TARJETA = 'a[href^="/services/"]:not([href*="search"])';

test.describe('Asistente de búsqueda', () => {
  test('encuentra profesionales a partir de una frase corriente', async ({
    page,
  }) => {
    await page.goto('/');

    await page
      .getByRole('button', { name: 'Abrir el asistente de búsqueda' })
      .click();

    const panel = page.getByRole('dialog', {
      name: 'Cuéntanos qué necesitas',
    });
    await expect(panel).toBeVisible();

    await panel
      .getByPlaceholder('Se me ha roto el grifo de la cocina...')
      .fill('se me ha roto el grifo de la cocina en Madrid');
    await panel.getByRole('button', { name: 'Buscar' }).click();

    // Los criterios se comprueban sobre su propia fila y no sobre el panel
    // entero: «Fontanería» sale también en cada tarjeta de resultado.
    const criterios = panel.getByRole('status');

    // Sin clave de modelo el asistente responde igualmente con el diccionario
    // de oficios, así que la búsqueda tiene que dar resultados en cualquier
    // entorno: lo que cambia es la interpretación, no el servicio.
    await expect(criterios).toBeVisible({ timeout: 20000 });
    await expect(criterios).toContainText('Fontanería');
    await expect(panel.locator(TARJETA).first()).toBeVisible();

    // El eco refleja lo que de verdad se aplicó: o la ciudad pedida, o el
    // aviso de que se ha buscado en toda España tras relajarla.
    await expect(criterios).toContainText(/Madrid|en toda España/);
  });

  test('se cierra y deja el botón flotante', async ({ page }) => {
    await page.goto('/services/search');

    const abrir = page.getByRole('button', {
      name: 'Abrir el asistente de búsqueda',
    });
    await abrir.click();

    const panel = page.getByRole('dialog', {
      name: 'Cuéntanos qué necesitas',
    });
    await expect(panel).toBeVisible();

    // El foco salta al campo: el botón que lo tenía deja de existir al abrir.
    await expect(
      panel.getByPlaceholder('Se me ha roto el grifo de la cocina...'),
    ).toBeFocused();

    await panel.getByRole('button', { name: 'Cerrar el asistente' }).click();
    await expect(panel).toBeHidden();
    await expect(abrir).toBeVisible();

    await abrir.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
});
