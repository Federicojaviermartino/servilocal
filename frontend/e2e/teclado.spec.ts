import { test, expect, Page } from '@playwright/test';
import { entrarComo } from './ayudas';

/**
 * Lo que axe no puede ver.
 *
 * El análisis automático mira el documento quieto: contraste, nombres
 * accesibles, papeles. No prueba si se puede usar la aplicación sin ratón, y
 * eso es lo primero que hace quien revisa accesibilidad de verdad.
 */
/** En la vista estrecha la navegación vive detrás del botón de menú. */
async function abrirMenuSiHaceFalta(page: Page) {
  const boton = page.getByRole('button', { name: /Abrir menú/i });
  if (await boton.isVisible()) await boton.click();
}

test.describe('Uso con teclado', () => {
  test('el enlace de salto aparece al tabular y lleva al contenido', async ({
    page,
  }) => {
    // Está oculto hasta que recibe el foco: si no apareciera, el primer
    // tabulador de la página no serviría para nada.
    await page.goto('/');
    await page.keyboard.press('Tab');

    const salto = page.getByRole('link', { name: /contenido/i });
    await expect(salto).toBeFocused();
    await expect(salto).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
  });

  test('la campana se abre, se cierra con Escape y devuelve el foco', async ({
    page,
  }) => {
    // Sin devolver el foco, cerrar el panel deja al teclado al principio de
    // la página y hay que recorrerla entera otra vez.
    await entrarComo(page, 'cliente');

    const campana = page.getByRole('button', { name: /avisos/i }).first();
    await campana.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(campana).toBeFocused();
  });

  test('las pestañas de administración se recorren con las flechas', async ({
    page,
  }) => {
    // Es el patrón de ARIA: el grupo es una sola parada del tabulador y
    // dentro se navega con flechas. Antes había que tabular cinco veces para
    // pasar de largo, y las flechas no hacían nada.
    await entrarComo(page, 'administracion');
    await page.goto('/admin');

    const primera = page.getByRole('tab', { name: 'Usuarios' });
    await primera.focus();
    await expect(primera).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowRight');

    const segunda = page.getByRole('tab', { name: /Reputación/ });
    await expect(segunda).toBeFocused();
    await expect(segunda).toHaveAttribute('aria-selected', 'true');
    await expect(primera).toHaveAttribute('aria-selected', 'false');
  });

  test('Fin salta a la última pestaña e Inicio vuelve a la primera', async ({
    page,
  }) => {
    await entrarComo(page, 'administracion');
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Usuarios' }).focus();

    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'IA' })).toBeFocused();

    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'Usuarios' })).toBeFocused();
  });

  test('solo una pestaña es parada del tabulador', async ({ page }) => {
    await entrarComo(page, 'administracion');
    await page.goto('/admin');

    const tabulables = await page
      .getByRole('tab')
      .evaluateAll(
        (nodos) =>
          nodos.filter((n) => n.getAttribute('tabindex') !== '-1').length,
      );

    expect(tabulables).toBe(1);
  });

  test('la navegación principal dice en qué sección estás', async ({
    page,
  }) => {
    // Es lo que distingue una lista de enlaces de un menú: sin esto, quien
    // escucha la página oye cinco destinos idénticos y ninguna posición.
    //
    // En móvil la navegación ancha está oculta y hay que abrir el menú: la
    // marca tiene que estar en los dos, no solo en el que se ve al revisar
    // desde un portátil.
    await page.goto('/services/search');
    await abrirMenuSiHaceFalta(page);

    const actual = page.locator('a[aria-current="page"]:visible');
    await expect(actual.first()).toBeVisible();
    await expect(actual.first()).toHaveAttribute('href', /services\/search/);
  });

  test('en la portada no hay ninguna sección marcada', async ({ page }) => {
    // Marcar «Buscar servicios» desde la portada sería mentir, y es lo que
    // pasaría si la comparación fuera solo por prefijo.
    await page.goto('/');
    await abrirMenuSiHaceFalta(page);

    await expect(page.locator('header a[aria-current="page"]')).toHaveCount(0);
  });
});

test.describe('Lo que solo se veía', () => {
  test('un campo con error lo dice, no solo lo pinta de rojo', async ({
    page,
  }) => {
    // El mensaje estaba debajo en rojo y sin enlazar: quien no distingue el
    // color no sabía qué campo fallaba, y quien escucha la página no oía el
    // motivo.
    await page.goto('/auth/login');
    await page.getByLabel(/correo/i).fill('esto-no-es-un-correo');
    await page.getByRole('button', { name: /Entrar|Iniciar/ }).click();

    const campo = page.getByLabel(/correo/i);
    await expect(campo).toHaveAttribute('aria-invalid', 'true');

    const descrito = await campo.getAttribute('aria-describedby');
    expect(descrito).toBeTruthy();
    await expect(page.locator(`#${descrito}`)).toBeVisible();
  });

  test('la opción de registro enfocada se distingue', async ({ page }) => {
    // El control real está oculto con sr-only, así que sin un anillo en la
    // tarjeta el foco no se veía en ninguna parte.
    //
    // Se mide la sombra calculada y no la clase: comprobar que pone
    // «focus-within:ring-2» pasaría igual aunque Tailwind no generase la
    // regla, que es justo lo que hay que descartar.
    await page.goto('/auth/register');

    const tarjeta = page.locator('label:has(input[value="client"])');
    const sombra = () => tarjeta.evaluate((n) => getComputedStyle(n).boxShadow);

    const antes = await sombra();
    await page.locator('input[value="client"]').focus();
    const despues = await sombra();

    expect(despues).not.toBe(antes);
    expect(despues).not.toBe('none');
  });
});
