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

/**
 * El recuento que se ve, junto a la lista. El mismo texto va otra vez fuera
 * de la vista, en la región que lo anuncia a quien no ve la pantalla: por el
 * texto solo, serían dos.
 */
const recuento = (page: Page, texto: string | RegExp) =>
  page.getByRole('paragraph').filter({ hasText: texto });

/** Y el que se anuncia. */
const anunciado = (page: Page, texto: string) =>
  page.getByRole('status').filter({ hasText: texto });

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
    await expect(recuento(page, /resultados? encontrados?/)).toBeVisible();
    await expect(page.locator(TARJETA).first()).toBeVisible();
  });

  test('el buscador pagina y cambia de contenido', async ({ page }) => {
    await page.goto('/services/search');

    const paginacion = page.getByRole('navigation', {
      name: 'Paginación de resultados',
    });
    await expect(paginacion).toBeVisible();

    const primerTitulo = await page
      .locator(TARJETA + ' h2')
      .first()
      .textContent();

    await paginacion.getByRole('button', { name: 'Página 2' }).click();
    await expect(
      paginacion.getByRole('button', { name: 'Página 2' }),
    ).toHaveAttribute('aria-current', 'page');

    // Esperando a que cambie, no leyéndolo una vez: la página 2 puede estar
    // marcada un instante antes de que lleguen sus resultados, y entonces se
    // comparaba la primera tarjeta de la página 1 consigo misma.
    expect(primerTitulo).toBeTruthy();
    await expect(page.locator(TARJETA + ' h2').first()).not.toHaveText(
      primerTitulo!,
    );
  });

  test('buscar un texto cambia la dirección y los resultados llegan del servidor', async ({
    page,
  }) => {
    // Antes se pedía al pulsar y otra vez al cambiar la URL, y la segunda
    // petición, que era la que se quedaba, perdía los filtros del panel.
    // Ahora la búsqueda la hace el servidor al servir la dirección nueva: el
    // navegador no pide nada a la API mientras el servidor conteste.
    await page.goto('/services/search');
    await expect(page.locator(TARJETA).first()).toBeVisible();

    const pedidas: string[] = [];
    page.on('request', (peticion) => {
      if (peticion.url().includes('/api/services/search')) {
        pedidas.push(peticion.url());
      }
    });

    await page.getByPlaceholder('¿Qué servicio necesitas?').fill('pintura');
    await page.getByRole('button', { name: 'Buscar' }).click();

    await expect(page).toHaveURL(/q=pintura/);
    await expect(page.locator(TARJETA).first()).toBeVisible();
    expect(pedidas).toEqual([]);
  });

  test('el buscador llega ya pintado del servidor', async ({ request }) => {
    // El HTML llegaba sin título, sin filtros y sin un solo enlace a una
    // ficha: un buscador veía una página vacía.
    const html = await (await request.get('/services/search')).text();

    expect(html).toContain('Resultados de la búsqueda');
    expect(html).toMatch(/href="\/services\/[0-9a-f-]{36}"/);
  });

  test('la página de resultados va en la dirección', async ({ page }) => {
    // Quien volvía atrás desde una ficha abierta en la página 2 aterrizaba
    // en la 1.
    await page.goto('/services/search?page=2');
    await expect(
      page
        .getByRole('navigation', { name: 'Paginación de resultados' })
        .getByRole('button', { name: 'Página 2' }),
    ).toHaveAttribute('aria-current', 'page');

    await page.locator(TARJETA).first().click();
    await page.waitForURL(/\/services\/[0-9a-f-]{36}$/);
    await page.goBack();

    await expect(page).toHaveURL(/page=2/);
  });

  test('filtrar por ciudad acota los resultados y Limpiar los restaura', async ({
    page,
  }) => {
    await page.goto('/services/search');
    await expect(recuento(page, '25 resultados encontrados')).toBeVisible();

    await abrirFiltros(page);
    await page.getByLabel('Ciudad').selectOption('Murcia');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(recuento(page, '1 resultado encontrado')).toBeVisible();
    // Filtrar vuelve a montar la lista: sin anunciarlo, quien no ve la
    // pantalla no sabría que ha cambiado nada.
    await expect(anunciado(page, '1 resultado encontrado')).toBeAttached();

    await abrirFiltros(page);
    await page.getByRole('button', { name: 'Limpiar' }).click();
    await expect(recuento(page, '25 resultados encontrados')).toBeVisible();
  });

  test('ordenar por precio pone primero el más barato y lo deja en la dirección', async ({
    page,
    request,
  }) => {
    // La API sabía ordenar y la interfaz no lo ofrecía: todo salía por
    // fecha de publicación.
    await page.goto('/services/search');
    await expect(page.locator(TARJETA).first()).toBeVisible();
    const porPrecio = page.getByRole('button', { name: 'Precio más bajo' });
    await expect(
      page.getByRole('button', { name: 'Más recientes' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await porPrecio.click();

    await expect(page).toHaveURL(/sort=price/);
    await expect(porPrecio).toHaveAttribute('aria-pressed', 'true');
    // El primero de la página es el que la API da por más barato.
    const respuesta = await request.get(
      '/api/services/search?sortBy=price&limit=1',
    );
    const [masBarato] = (await respuesta.json()).data as { id: string }[];
    await expect(page.locator(TARJETA).first()).toHaveAttribute(
      'href',
      new RegExp(`/services/${masBarato.id}$`),
    );
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

  test('la ficha llega ya con su contenido en el HTML', async ({
    page,
    request,
  }) => {
    // Se pedía desde el navegador: el HTML solo traía esqueletos, y un
    // buscador o una vista previa en una red social no veían ni el título.
    await page.goto('/services/search');
    const tarjeta = page.locator(TARJETA).first();
    const titulo = (await tarjeta.locator('h2').textContent())?.trim();
    const enlace = await tarjeta.getAttribute('href');

    const html = await (await request.get(enlace!)).text();

    expect(html).toMatch(/<h1[^>]*>[^<]*<\/h1>/);
    expect(html).toContain(titulo!);
    expect(html).toContain('Sobre el profesional');
  });

  test('los precios llevan la moneda, y la vista activa se anuncia', async ({
    page,
  }) => {
    await page.goto('/services/search');

    // La tarjeta decía «30 por hora», sin euros.
    await expect(page.locator(TARJETA).first()).toContainText(/\d\s?€/);
    // Solo se distinguía por el color.
    await expect(page.getByRole('button', { name: 'Lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Mapa' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
