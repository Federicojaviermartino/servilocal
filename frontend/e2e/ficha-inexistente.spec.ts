import { test, expect } from '@playwright/test';

const FANTASMA = '00000000-0000-4000-8000-000000000000';

/**
 * Una dirección que no corresponde a nada tiene que decirlo con el código,
 * no solo con el texto.
 *
 * La ficha es un componente de cliente, así que el servidor respondía 200 con
 * el esqueleto y el «no encontrado» aparecía después de hidratar. Para un
 * buscador eso es una página válida y vacía: un 404 blando, que se indexa y
 * se queda ahí.
 */
test.describe('Ficha de un servicio que no existe', () => {
  test('responde 404, no 200', async ({ page }) => {
    const respuesta = await page.goto(`/services/${FANTASMA}`);

    expect(respuesta?.status()).toBe(404);
  });

  test('y no se deja indexar', async ({ page }) => {
    await page.goto(`/services/${FANTASMA}`);

    // Hay dos etiquetas robots: la que pone Next en su página de 404 y la
    // que declara el layout. Se comprueban todas, porque una sola que
    // dijera «index» bastaría para que el buscador se quedara con la página.
    const contenidos = await page
      .locator('meta[name="robots"]')
      .evaluateAll((nodos) =>
        nodos.map((n) => n.getAttribute('content') ?? ''),
      );

    expect(contenidos.length).toBeGreaterThan(0);
    for (const contenido of contenidos) {
      expect(contenido).toContain('noindex');
    }
  });

  test('en los demás idiomas también', async ({ page }) => {
    // Diez idiomas son diez direcciones por servicio: si solo respondiera
    // bien el predeterminado, quedarían nueve páginas fantasma por cada una.
    const respuesta = await page.goto(`/en/services/${FANTASMA}`);

    expect(respuesta?.status()).toBe(404);
  });

  test('una ficha de verdad sigue respondiendo 200', async ({
    page,
    request,
  }) => {
    // El control: sin esto, devolver 404 siempre pasaría las tres de arriba.
    const busqueda = await request.get(
      'http://localhost:3001/api/services/search?limit=1',
    );
    const { data } = await busqueda.json();

    const respuesta = await page.goto(`/services/${data[0].id}`);

    expect(respuesta?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
});
