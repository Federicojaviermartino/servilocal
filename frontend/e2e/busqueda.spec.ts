import { test, expect, Page } from '@playwright/test';

// La cabecera tiene un enlace a /services/search, así que hace falta excluirlo
// para quedarse solo con las tarjetas de resultado.
const TARJETA = 'a[href^="/services/"]:not([href*="search"])';

/**
 * En pantallas estrechas el panel de filtros está plegado tras un botón.
 * Los tests que tocan filtros lo despliegan primero si hace falta.
 */
async function abrirFiltros(page: Page) {
  const desplegar = page.getByRole('button', { name: 'Filtros', exact: true });
  const visible = await desplegar.isVisible();
  const yaAbierto = visible
    ? (await desplegar.getAttribute('aria-expanded')) === 'true'
    : true;
  if (visible && !yaAbierto) {
    await desplegar.click();
  }
}

test.describe('Búsqueda de servicios', () => {
  test('la portada lleva al buscador y muestra resultados', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Profesionales de confianza/ }),
    ).toBeVisible();

    await page.getByPlaceholder('¿Qué servicio necesitas?').fill('fontaneria');
    await page.getByRole('button', { name: 'Buscar' }).click();

    await expect(page).toHaveURL(/\/services\/search/);
    // Sin tildes debe encontrar igualmente los servicios de Fontanería
    await expect(page.getByText(/resultados? encontrados?/)).toBeVisible();
    await expect(page.locator(TARJETA).first()).toBeVisible();
  });

  test('el buscador pagina y cambia de contenido', async ({ page }) => {
    await page.goto('/services/search');

    const paginacion = page.getByRole('navigation', {
      name: 'Paginación de resultados',
    });
    await expect(paginacion).toBeVisible();

    const primerTitulo = await page
      .locator(TARJETA + ' h3')
      .first()
      .textContent();

    await paginacion.getByRole('button', { name: 'Página 2' }).click();
    await expect(
      paginacion.getByRole('button', { name: 'Página 2' }),
    ).toHaveAttribute('aria-current', 'page');

    const segundoTitulo = await page
      .locator(TARJETA + ' h3')
      .first()
      .textContent();
    expect(segundoTitulo).not.toBe(primerTitulo);
  });

  test('filtrar por ciudad acota los resultados y Limpiar los restaura', async ({
    page,
  }) => {
    await page.goto('/services/search');
    await expect(page.getByText('25 resultados encontrados')).toBeVisible();

    await abrirFiltros(page);
    await page.getByLabel('Ciudad').selectOption('Murcia');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page.getByText('1 resultado encontrado')).toBeVisible();

    await abrirFiltros(page);
    await page.getByRole('button', { name: 'Limpiar' }).click();
    await expect(page.getByText('25 resultados encontrados')).toBeVisible();
  });

  test('la vista de mapa muestra todos los servicios sin paginar', async ({
    page,
  }) => {
    await page.goto('/services/search');
    await page.getByRole('button', { name: 'Mapa' }).click();

    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(25);
    await expect(
      page.getByRole('navigation', { name: 'Paginación de resultados' }),
    ).toHaveCount(0);
  });

  test('la ficha de servicio muestra precio y valoraciones', async ({
    page,
  }) => {
    await page.goto('/services/search');
    await page.locator(TARJETA).first().click();

    await expect(page).toHaveURL(/\/services\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('button', { name: 'Reservar ahora' }),
    ).toBeVisible();
    await expect(page.getByText('Sobre el profesional')).toBeVisible();
  });
});
