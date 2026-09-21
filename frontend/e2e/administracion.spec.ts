import { test, expect } from '@playwright/test';
import { entrarComo } from './ayudas';

/**
 * El botón de demostración entra y redirige a la portada. Hay que esperar a
 * que llegue: /admin rebota a la pantalla de acceso mientras no haya sesión
 * guardada, así que ir antes de tiempo deja el test en la página equivocada.
 */
test.describe('Panel de administración', () => {
  test('la cuenta de demostración lo ve todo y no puede tocar nada', async ({
    page,
  }) => {
    await entrarComo(page, 'administracion');
    await page.goto('/admin');

    await expect(
      page.getByRole('heading', { name: 'Panel de administración' }),
    ).toBeVisible();

    // El aviso va antes que el intento: el bloqueo es deliberado y tiene que
    // parecerlo, en lugar de sorprender con un error al pulsar.
    await expect(
      page.getByText('Cuenta de demostración, en solo lectura'),
    ).toBeVisible();

    // Las métricas son lo que da valor al panel: si no cargan, la demostración
    // no enseña nada aunque el aviso salga.
    await expect(page.getByLabel('Métricas de la plataforma')).toBeVisible();

    await page.getByRole('tab', { name: 'Usuarios' }).click();
    const botonesEstado = page.getByRole('button', {
      name: /^(Desactivar|Activar)$/,
    });
    await expect(botonesEstado.first()).toBeVisible();

    const total = await botonesEstado.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      await expect(botonesEstado.nth(i)).toBeDisabled();
    }
  });

  test('las gráficas se pintan con los datos del servidor', async ({
    page,
  }) => {
    await entrarComo(page, 'administracion');
    await page.goto('/admin');

    await expect(
      page.getByRole('heading', { name: 'Reservas por semana' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Reparto de valoraciones' }),
    ).toBeVisible();

    // Recharts dibuja en SVG: comprobar el título solo diría que la caja
    // existe, no que dentro haya una gráfica. Una serie sin puntos deja el
    // marco pintado y la caja vacía, y eso es lo que hay que descartar.
    const svg = page.locator('.recharts-surface');
    await expect(svg.first()).toBeVisible();
    expect(await svg.count()).toBeGreaterThanOrEqual(4);

    await expect(page.locator('.recharts-area-area').first()).toBeVisible();
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();

    // El reparto por estado es un anillo, y sus trozos se distinguían solo
    // por el color: para saber cuál era cada uno había que pasar el ratón
    // por encima. En un móvil no hay ratón, con el teclado no se llega y
    // quien no distinga esos colores no tiene nada. Las otras tres gráficas
    // llevan ejes rotulados; esta necesitaba su leyenda.
    const leyenda = page.locator('.recharts-legend-wrapper');
    await expect(leyenda).toBeVisible();
    await expect(leyenda).toContainText('Completada');
  });

  test('el consumo de IA se explica en lugar de mostrar ceros a secas', async ({
    page,
  }) => {
    await entrarComo(page, 'administracion');
    await page.goto('/admin');

    await page.getByRole('tab', { name: 'IA', exact: true }).click();
    await expect(page.getByText('Consumo del modelo')).toBeVisible();

    // La barra dice cuánto del tope se lleva gastado. Es la cifra que evita
    // sorpresas en la factura, así que tiene que estar siempre.
    await expect(
      page.getByRole('progressbar', { name: 'Gasto sobre el tope mensual' }),
    ).toBeVisible();

    // El estado se afirma siempre, con clave o sin ella: un cero sin motivo
    // se lee como una avería del panel. La rama condicional de más abajo
    // sería verde en vacío si el panel dejara de pintar el distintivo.
    const estado = page
      .getByText('Activa', { exact: true })
      .or(page.getByText('Inactiva', { exact: true }))
      .or(page.getByText('Tope alcanzado', { exact: true }));
    await expect(estado).toBeVisible();

    // Y apagada, además, se explica por qué.
    if (await page.getByText('Inactiva', { exact: true }).isVisible()) {
      await expect(page.getByText(/La capa está apagada/)).toBeVisible();
    }
  });

  test('la cola de moderación tiene casos y la demo no puede resolverlos', async ({
    page,
  }) => {
    await entrarComo(page, 'administracion');
    await page.goto('/admin');

    await page.getByRole('tab', { name: /Valoraciones/i }).click();

    // La semilla crea tres denuncias con su alegación. Una cola vacía no se
    // puede enseñar, y una llena que no se pudiera resolver sería una
    // bandeja de entrada sin salida.
    await expect(page.getByText('Reportada').first()).toBeVisible();

    const acciones = page.getByRole('button', { name: /Mantener|Eliminar/ });
    await expect(acciones.first()).toBeVisible();

    // Existen, y para esta cuenta están desactivadas.
    const total = await acciones.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      await expect(acciones.nth(i)).toBeDisabled();
    }
  });

  test('el historial de auditoría se lee y no se puede tocar', async ({
    page,
  }) => {
    await entrarComo(page, 'administracion');
    await page.goto('/admin');

    await page.getByRole('tab', { name: 'Auditoría' }).click();

    const tabla = page.getByRole('table', {
      name: 'Historial de acciones de administración',
    });
    await expect(tabla).toBeVisible();
    await expect(
      tabla.getByRole('columnheader', { name: 'Quién' }),
    ).toBeVisible();
    await expect(
      tabla.getByRole('columnheader', { name: 'Acción' }),
    ).toBeVisible();

    // Sin esto el test pasaría con el historial roto: el panel deja la tabla
    // vacía tanto si no hay nada anotado como si la petición ha fallado, y
    // solo el aviso de error distingue un caso del otro.
    await expect(
      page.getByText('No se ha podido cargar el historial.'),
    ).toBeHidden();

    // Un historial que se puede editar no prueba nada. El servidor no expone
    // ruta para ello y el panel tampoco ofrece por dónde: ni un botón dentro
    // de la tabla.
    expect(await tabla.getByRole('button').count()).toBe(0);

    // Y o hay entradas, o se dice que no las hay: una tabla sin filas y sin
    // explicación se lee como una avería. Con la base recién sembrada no hay
    // nada anotado, así que las dos ramas ocurren de verdad.
    const filas = tabla.locator('tbody tr');
    const sinEntradas = page.getByText('No hay ninguna acción registrada');

    if (await sinEntradas.isVisible()) {
      await expect(filas).toHaveCount(1);
    } else {
      await expect(filas.first()).toBeVisible();

      // Y lo que se lee es la frase, no el nombre interno de la acción: una
      // clave que falte en el catálogo se vería en crudo, con su guion bajo.
      await expect(tabla.getByText(/^[a-z]+_[a-z_]+$/)).toHaveCount(0);
    }
  });

  test('un cliente acaba en su panel y no en el de administración', async ({
    page,
  }) => {
    await entrarComo(page, 'cliente');
    await page.goto('/admin');

    // Se comprueba el destino y no solo la ausencia del título: si el acceso
    // fallara, «no se ve el panel» sería cierto por el motivo equivocado.
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
