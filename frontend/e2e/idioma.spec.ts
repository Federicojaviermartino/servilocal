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
  test('la unidad de precio también cambia de idioma', async ({ page }) => {
    // Se guarda en castellano («por hora») y se interpolaba en crudo dentro
    // de la frase del precio, así que una tarjeta en alemán decía «45 a 90
    // por hora». El valor guardado no cambia; cambia cómo se escribe.
    const tarjetas = page.locator(
      'a[href*="/services/"]:not([href*="search"])',
    );

    await page.goto('/services/search');
    await expect(tarjetas.first()).toBeVisible();
    await expect(tarjetas.getByText(/por hora/).first()).toBeVisible();

    await page.goto('/de/services/search');
    await expect(tarjetas.first()).toBeVisible();
    await expect(tarjetas.getByText(/pro Stunde/).first()).toBeVisible();
    await expect(tarjetas.getByText(/por hora/)).toHaveCount(0);
  });

  test('las categorías del catálogo también cambian de idioma', async ({
    page,
  }) => {
    // Los nombres viven en la base de datos en castellano. Si no se
    // tradujeran, quien navega en alemán vería la interfaz en alemán y
    // «Fontanería» dentro de cada tarjeta, que es el agujero que esto tapa.
    // Se mira dentro de las tarjetas: el desplegable de filtros también
    // lleva el nombre, pero sus <option> cuentan como ocultas y la
    // comprobación fallaria por el motivo equivocado.
    const tarjetas = page.locator(
      'a[href*="/services/"]:not([href*="search"])',
    );

    // Y solo al distintivo de categoría: los títulos y las descripciones los
    // escriben los profesionales y siguen en castellano, así que buscar la
    // palabra en la tarjeta entera daría positivo por otro motivo.
    const distintivos = tarjetas.locator('span.rounded-full');

    await page.goto('/services/search?q=fontaneria');
    await expect(tarjetas.first()).toBeVisible();
    await expect(distintivos.getByText('Fontanería').first()).toBeVisible();

    await page.goto('/de/services/search?q=fontaneria');
    await expect(tarjetas.first()).toBeVisible();
    await expect(
      distintivos.getByText('Sanitärinstallation').first(),
    ).toBeVisible();
    await expect(distintivos.getByText('Fontanería')).toHaveCount(0);
  });

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
