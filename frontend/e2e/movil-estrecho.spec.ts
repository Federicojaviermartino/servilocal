import { test, expect, Page } from '@playwright/test';

/**
 * 375 px de ancho: iPhone SE y los iPhone anteriores al 12.
 *
 * El proyecto «movil» usa un Pixel 5, que son 393, así que este ancho no
 * estaba cubierto por nada. Y no se comprueba a ojo: se mide. Un desborde
 * horizontal no es cuestión de gusto —obliga a arrastrar la página de lado
 * para leer— y es de lo poco de maquetación que una máquina puede afirmar
 * con certeza.
 */
const ANCHO = 375;

const RUTAS = [
  ['portada', '/'],
  ['buscador', '/services/search'],
  ['acceso', '/auth/login'],
  ['registro', '/auth/register'],
  ['privacidad', '/privacy'],
];

/**
 * Cuánto se sale la página de su propio ancho.
 *
 * Se mide sobre el documento y sobre cada elemento, porque lo habitual es que
 * el culpable sea uno solo —una tabla, un título largo, una fila que no
 * envuelve— y saber cuál ahorra la mitad del trabajo.
 */
async function desbordes(page: Page) {
  return page.evaluate((ancho) => {
    /**
     * Lo ancho dentro de algo que se desplaza no es un desborde.
     *
     * Una tira de pestañas o una tabla dentro de su propio contenedor con
     * overflow-x son deliberadas y no obligan a mover la página entera. La
     * primera versión de esta comprobación las marcaba y señalaba como fallo
     * justo lo que estaba bien resuelto.
     */
    const dentroDeUnDeslizable = (el: Element): boolean => {
      let padre = el.parentElement;
      while (padre && padre !== document.body) {
        const desbordeX = getComputedStyle(padre).overflowX;
        if (desbordeX === 'auto' || desbordeX === 'scroll') return true;
        padre = padre.parentElement;
      }
      return false;
    };

    const fuera: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const caja = el.getBoundingClientRect();
      // Dos píxeles de margen: los redondeos de subpíxel no son un desborde.
      if (
        caja.right > ancho + 2 &&
        caja.width > 0 &&
        !dentroDeUnDeslizable(el)
      ) {
        const clases =
          typeof el.className === 'string' ? el.className.slice(0, 60) : '';
        fuera.push(
          `${el.tagName.toLowerCase()}.${clases} → ${Math.round(caja.right)}px`,
        );
      }
    }
    return {
      documento: document.documentElement.scrollWidth,
      elementos: fuera.slice(0, 5),
    };
  }, ancho());
}

function ancho() {
  return ANCHO;
}

test.use({ viewport: { width: ANCHO, height: 667 } });

test.describe('Pantalla estrecha, 375 px', () => {
  for (const [nombre, ruta] of RUTAS) {
    test(`${nombre} no obliga a desplazarse de lado`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');

      const medida = await desbordes(page);

      expect(medida.elementos, `elementos que se salen en ${ruta}`).toEqual([]);
      expect(medida.documento).toBeLessThanOrEqual(ANCHO + 2);
    });
  }

  test('el panel de administración tampoco', async ({ page }) => {
    // El más expuesto: tablas, gráficas y filas de métricas. Es donde un
    // ancho de 375 se nota antes.
    await page.goto('/auth/login');
    await page
      .getByRole('button', { name: 'Administración', exact: true })
      .click();
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'));

    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Panel de administración' }),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');

    const medida = await desbordes(page);

    expect(medida.elementos, 'elementos que se salen en /admin').toEqual([]);
    expect(medida.documento).toBeLessThanOrEqual(ANCHO + 2);
  });
});
