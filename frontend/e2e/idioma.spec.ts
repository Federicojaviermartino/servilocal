import { test, expect, type Page } from '@playwright/test';

/**
 * El selector aparece dos veces: en la barra en escritorio y dentro del menú
 * desplegable en móvil. Se devuelve el que esté realmente visible.
 */
async function selectorIdioma(pagina: Page) {
  const candidatos = pagina.getByLabel('Cambiar idioma');
  if (await candidatos.first().isVisible()) return candidatos.first();
  await pagina.getByRole('button', { name: 'Abrir menú' }).click();
  return candidatos.last();
}

test.describe('Idioma', () => {
  test('sirve el sitio en el idioma del navegador', async ({ browser }) => {
    const contexto = await browser.newContext({ locale: 'en-US' });
    const pagina = await contexto.newPage();
    await pagina.goto('/');

    await expect(pagina).toHaveURL(/\/en$/);
    await expect(pagina.locator('html')).toHaveAttribute('lang', 'en');
    await expect(pagina.getByRole('heading', { level: 1 })).toHaveText(
      'Trusted professionals, close to you',
    );

    await contexto.close();
  });

  test('cambiar de idioma conserva la página y los filtros', async ({
    page,
  }) => {
    await page.goto('/services/search?q=fontanero');

    const selector = await selectorIdioma(page);
    await selector.selectOption('en');

    // La ruta y la consulta sobreviven al cambio: solo cambia el prefijo.
    await expect(page).toHaveURL(/\/en\/services\/search\?q=fontanero$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('el árabe se pinta de derecha a izquierda', async ({ page }) => {
    await page.goto('/ar');

    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('declara las alternativas de idioma para los buscadores', async ({
    page,
  }) => {
    await page.goto('/');

    // Diez idiomas más x-default: sin esto los buscadores tratarían cada
    // traducción como contenido duplicado.
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      11,
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="ar"]'),
    ).toHaveAttribute('href', /\/ar$/);
  });
});
