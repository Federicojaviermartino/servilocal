import { test, expect, Page } from '@playwright/test';
import { entrarComo } from './ayudas';

/**
 * Abre una pestaña del panel y espera a que de verdad quede abierta.
 *
 * En Safari, alguna vez la pestaña no cambiaba: en la captura del fallo
 * seguía abierta «Usuarios», y la prueba esperaba veinte segundos un
 * contenido que no iba a llegar. Las gráficas de encima llegan después que
 * las pestañas y las empujan hacia abajo, así que un clic que sale justo
 * entonces cae en otro sitio. Se pulsa hasta que queda seleccionada.
 */
async function abrirPestana(
  page: Page,
  nombre: string | RegExp,
  exacto = false,
): Promise<void> {
  const pestana = page.getByRole('tab', { name: nombre, exact: exacto });
  await expect(async () => {
    await pestana.click({ timeout: 5000 });
    await expect(pestana).toHaveAttribute('aria-selected', 'true', {
      timeout: 1000,
    });
  }).toPass({ timeout: 30000 });
}

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

    // Y sin datos personales: la cuenta es pública, y el correo de cada
    // persona registrada quedaba a la vista de cualquier visitante.
    await expect(page.getByText('l•••@e•••').first()).toBeVisible();
    await expect(page.getByText('laura@ejemplo.com')).toHaveCount(0);
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

    await abrirPestana(page, 'IA', true);
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

    await abrirPestana(page, /Valoraciones/i);

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

    await abrirPestana(page, 'Auditoría');

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

  test('los pagos por revisar se ven, y la cuenta de demostración no puede moverlos', async ({
    page,
  }) => {
    // La administración podía cobrar y reembolsar por la API, pero el panel
    // no enseñaba qué: una retención atascada solo se veía en el registro.
    await entrarComo(page, 'administracion');
    await page.goto('/admin');

    await abrirPestana(page, 'Pagos');

    // La semilla trae reservas completadas sin pago: eso ya es dinero que
    // alguien tiene que mirar.
    const resumen = page.getByRole('list', {
      name: 'Cuántos hay de cada tipo',
    });
    await expect(resumen.getByRole('listitem')).toHaveCount(3);
    await expect(resumen).toContainText(/Completada sin cobrar: [1-9]/);

    const lista = page.getByRole('list', { name: 'Pagos por revisar' });
    await expect(lista.getByRole('listitem').first()).toBeVisible();
    await expect(lista.getByRole('listitem').first()).toContainText(
      /Reserva #[0-9a-f]{8}/,
    );
    // Lo que se lee es la frase, no la clave del motivo.
    await expect(lista.getByText(/^[a-z]+-[a-z-]+$/)).toHaveCount(0);

    // Y si alguno ofrece moverlo, a esta cuenta no la deja.
    const acciones = lista.getByRole('button');
    for (let i = 0; i < (await acciones.count()); i++) {
      await expect(acciones.nth(i)).toBeDisabled();
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
