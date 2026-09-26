import { expect, test } from '@playwright/test';
import { entrarComo } from './ayudas';

/**
 * Publicar un servicio desde el panel del profesional.
 *
 * No lo probaba nadie, y no funcionaba: el formulario no envía coordenadas y
 * la API las exigía, así que el alta respondía siempre con un 400 y el
 * profesional solo veía «No se pudo crear el servicio». Ahora la API sitúa el
 * servicio en su ciudad.
 */
test('un profesional publica un servicio y lo ve en su panel', async ({
  page,
}) => {
  await entrarComo(page, 'profesional');
  await page.goto('/dashboard/services');

  await page.getByRole('button', { name: 'Nuevo servicio' }).click();

  // Único por ejecución: los cuatro navegadores comparten la misma base.
  const titulo = `Revisión de caldera ${Date.now()}`;
  await page.getByLabel('Título del servicio').fill(titulo);
  await page
    .getByLabel('Descripción')
    .fill('Revisión anual de caldera de gas con certificado incluido.');
  await page.getByLabel('Categoría').selectOption({ index: 1 });
  await page.getByLabel('Precio mínimo (euros)').fill('40');
  await page.getByLabel('Dirección de referencia').fill('Calle Sierpes 10');
  await page.getByLabel('Ciudad').selectOption('Sevilla');
  const alta = page.waitForResponse(
    (r) => r.url().endsWith('/api/services') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Crear servicio' }).click();
  const respuesta = await alta;
  const { id } = (await respuesta.json()) as { id?: string };

  try {
    expect(respuesta.status()).toBe(201);
    await expect(page.getByText('Servicio creado')).toBeVisible();
    await expect(page.getByText(titulo)).toBeVisible();
  } finally {
    // Se borra pase lo que pase: la búsqueda cuenta los servicios de la
    // semilla, y los cuatro navegadores comparten la misma base.
    if (id) {
      await page.request.delete(`/api/services/${id}`, {
        headers: { origin: new URL(page.url()).origin },
      });
    }
  }
});
