import { test, expect } from '@playwright/test';

const claseHtml = (pagina: import('@playwright/test').Page) =>
  pagina.evaluate(() => document.documentElement.className);

test.describe('Tema claro y oscuro', () => {
  test('respeta la preferencia del sistema en la primera visita', async ({
    browser,
  }) => {
    const contexto = await browser.newContext({ colorScheme: 'dark' });
    const pagina = await contexto.newPage();
    await pagina.goto('/');
    await expect.poll(() => claseHtml(pagina)).toContain('dark');
    await contexto.close();
  });

  test('la elección del usuario prevalece sobre el sistema y se recuerda', async ({
    browser,
  }) => {
    // El sistema pide oscuro; el usuario elige claro y debe seguir en claro
    // después de recargar.
    const contexto = await browser.newContext({ colorScheme: 'dark' });
    const pagina = await contexto.newPage();
    await pagina.goto('/');

    await pagina.getByRole('button', { name: 'Activar tema claro' }).click();
    await expect.poll(() => claseHtml(pagina)).not.toContain('dark');

    await pagina.reload();
    await expect.poll(() => claseHtml(pagina)).not.toContain('dark');

    await contexto.close();
  });

  test('los campos de formulario siguen siendo legibles en oscuro', async ({
    browser,
  }) => {
    const contexto = await browser.newContext({ colorScheme: 'dark' });
    const pagina = await contexto.newPage();
    await pagina.goto('/services/search');

    // Un desplegable sin fondo propio hereda el blanco del navegador y deja
    // el texto ilegible: es el fallo que motivó este test.
    const fondo = await pagina
      .getByLabel('Ciudad')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const canales = (fondo.match(/\d+/g) || []).slice(0, 3).map(Number);
    const claridad = (canales[0] + canales[1] + canales[2]) / 3;
    expect(claridad).toBeLessThan(128);

    await contexto.close();
  });
});
