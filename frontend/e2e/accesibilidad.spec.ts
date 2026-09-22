import AxeBuilder from '@axe-core/playwright';
import { test, expect, Page } from '@playwright/test';
import { entrarComo } from './ayudas';

/**
 * Accesibilidad comprobada, no declarada.
 *
 * Las cosas que se han ido arreglando al tropezar con ellas —un botón con
 * solo un icono y sin nombre, el foco perdido al abrir un diálogo, un aviso
 * que aparecía sin anunciarse— son justo las que una herramienta detecta
 * sola. Lo que no detecta nadie es una regresión: por eso va aquí y no en una
 * revisión de un día.
 *
 * Se comprueba contra WCAG 2.1 niveles A y AA, que es lo que se entiende por
 * «accesible» sin más adjetivos.
 */
const NORMAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const RUTAS = [
  ['portada', '/'],
  ['buscador', '/services/search'],
  ['acceso', '/auth/login'],
  ['registro', '/auth/register'],
  ['privacidad', '/privacy'],
];

async function analizar(page: Page) {
  return new AxeBuilder({ page }).withTags(NORMAS).analyze();
}

/** Lo justo para poder arreglarlo: qué regla, dónde y cuántas veces. */
function resumir(
  violaciones: Awaited<ReturnType<typeof analizar>>['violations'],
) {
  return violaciones.map((v) => ({
    regla: v.id,
    impacto: v.impact,
    elementos: v.nodes.length,
    ejemplo: v.nodes[0]?.target.join(' '),
  }));
}

test.describe('Accesibilidad', () => {
  for (const [nombre, ruta] of RUTAS) {
    test(`${nombre} cumple WCAG 2.1 AA`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');

      const { violations } = await analizar(page);

      expect(resumir(violations)).toEqual([]);
    });
  }

  test('el panel de administración cumple WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /demo@servilocal\.com/ }).click();
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'));

    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Panel de administración' }),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');

    const { violations } = await analizar(page);

    expect(resumir(violations)).toEqual([]);

    // El panel son pestañas: analizar la que sale por defecto deja sin mirar
    // todo lo demás. La de auditoría es la que más texto tenue apila.
    await page.getByRole('tab', { name: 'Auditoría' }).click();
    await expect(
      page.getByRole('table', {
        name: 'Historial de acciones de administración',
      }),
    ).toBeVisible();

    expect(resumir((await analizar(page)).violations)).toEqual([]);
  });

  // El contraste del texto tenue era peor en oscuro que en claro —3,19 sobre
  // la superficie alterna frente a 4,36— y ninguna comprobación miraba ahí,
  // porque todas se ejecutan en el tema por defecto.
  //
  // Y durante un tiempo esto solo miró la portada, que es la página con menos
  // variedad de componentes de todo el sitio: sin formularios, sin tablas,
  // sin distintivos de estado. Ahora recorre las mismas rutas que en claro,
  // porque un color que falla en oscuro falla donde esté.
  for (const [nombre, ruta] of RUTAS) {
    test(`${nombre} cumple también en tema oscuro`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');

      expect(resumir((await analizar(page)).violations)).toEqual([]);
    });
  }

  test('el panel de administración cumple en oscuro, con sus tablas', async ({
    page,
  }) => {
    // Es donde vive casi todo el color con significado: distintivos de
    // estado, gráficas y cinco tablas. Si algo va a fallar en oscuro, falla
    // aquí antes que en la portada.
    await page.emulateMedia({ colorScheme: 'dark' });
    await entrarComo(page, 'administracion');
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Panel de administración' }),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(resumir((await analizar(page)).violations)).toEqual([]);

    await page.getByRole('tab', { name: 'Auditoría' }).click();
    await expect(
      page.getByRole('table', {
        name: 'Historial de acciones de administración',
      }),
    ).toBeVisible();

    expect(resumir((await analizar(page)).violations)).toEqual([]);
  });

  test('el asistente abierto cumple WCAG 2.1 AA', async ({ page }) => {
    // Un diálogo es donde más fácil se cuelan los fallos de foco y de nombre
    // accesible, y este se monta entero al pulsar.
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Abrir el asistente de búsqueda' })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Cuéntanos qué necesitas' }),
    ).toBeVisible();

    const { violations } = await analizar(page);

    expect(resumir(violations)).toEqual([]);
  });
});
