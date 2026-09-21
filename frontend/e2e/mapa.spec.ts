import { test, expect, Page } from '@playwright/test';

/**
 * El mapa tiene que enseñar lo que se ha buscado.
 *
 * El centro estaba fijo en Madrid y no se movía: buscar en Barcelona abría
 * un mapa de Madrid, sin un solo marcador a la vista y sin nada que
 * explicara por qué. Nueve de las diez ciudades con cobertura caían ahí.
 *
 * Aviso para quien toque estas comprobaciones: que el marcador exista, o que
 * Playwright lo dé por visible, NO sirve. Leaflet los dibuja igual cuando
 * quedan fuera del recuadro, y con el fallo original se colocaban en x=17956
 * de un contenedor que acaba en 1280. Hay que medir dónde caen.
 */
async function primerMarcadorDentroDelMapa(page: Page): Promise<boolean> {
  await page.locator('.leaflet-marker-icon').first().waitFor();

  const mapa = await page.locator('.leaflet-container').boundingBox();
  const marcador = await page
    .locator('.leaflet-marker-icon')
    .first()
    .boundingBox();

  if (!mapa || !marcador) return false;

  return (
    marcador.x >= mapa.x &&
    marcador.x <= mapa.x + mapa.width &&
    marcador.y >= mapa.y &&
    marcador.y <= mapa.y + mapa.height
  );
}

async function buscarEn(page: Page, ciudad: string) {
  await page.goto(`/services/search?city=${encodeURIComponent(ciudad)}`);
  await page.getByRole('button', { name: 'Mapa' }).click();
  await page.waitForSelector('.leaflet-container');
}

test.describe('Mapa de resultados', () => {
  test('encuadra sobre Barcelona, que está a 500 km de Madrid', async ({
    page,
  }) => {
    await buscarEn(page, 'Barcelona');

    expect(await page.locator('.leaflet-marker-icon').count()).toBeGreaterThan(
      0,
    );
    expect(await primerMarcadorDentroDelMapa(page)).toBe(true);
  });

  test('y sobre Sevilla, para que no valga con acertar una ciudad', async ({
    page,
  }) => {
    await buscarEn(page, 'Sevilla');

    expect(await primerMarcadorDentroDelMapa(page)).toBe(true);
  });

  test('todos los marcadores caben, no solo el primero', async ({ page }) => {
    // Encuadrar sobre uno sería tan malo como no encuadrar: la gracia es
    // ver de un vistazo dónde están todos.
    await buscarEn(page, 'Barcelona');
    await page.locator('.leaflet-marker-icon').first().waitFor();

    const mapa = (await page.locator('.leaflet-container').boundingBox())!;
    const marcadores = await page.locator('.leaflet-marker-icon').all();
    expect(marcadores.length).toBeGreaterThan(1);

    for (const marcador of marcadores) {
      const caja = (await marcador.boundingBox())!;
      expect(caja.x).toBeGreaterThanOrEqual(mapa.x);
      expect(caja.x).toBeLessThanOrEqual(mapa.x + mapa.width);
      expect(caja.y).toBeGreaterThanOrEqual(mapa.y);
      expect(caja.y).toBeLessThanOrEqual(mapa.y + mapa.height);
    }
  });

  test('sin resultados que situar se explica, en vez de un mapa en blanco', async ({
    page,
  }) => {
    await page.goto('/services/search?city=Barcelona&q=zzzzinexistente');
    await page.getByRole('button', { name: 'Mapa' }).click();

    await expect(
      page.getByText('Ninguno de estos resultados tiene ubicación'),
    ).toBeVisible();
  });
});
