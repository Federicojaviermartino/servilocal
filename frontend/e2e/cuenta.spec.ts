import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { entrarComo } from './ayudas';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const CLAVE = 'Clave12345!';

/** Un correo que nadie más usa: cada navegador y cada ejecución, el suyo. */
const correoNuevo = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@correo.test`;

/** Una cuenta real y nueva, registrada por la API. */
async function cuentaNueva(peticion: APIRequestContext): Promise<string> {
  const email = correoNuevo();
  const respuesta = await peticion.post(`${API}/auth/register`, {
    data: {
      firstName: 'Prueba',
      lastName: 'Cuenta',
      email,
      password: CLAVE,
      role: 'client',
      aceptaTerminos: true,
    },
  });
  expect(
    respuesta.ok(),
    `la cuenta se registra (${respuesta.status()}: ${await respuesta.text()})`,
  ).toBeTruthy();
  return email;
}

async function entrar(page: Page, email: string, clave: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test.describe('La cuenta', () => {
  test('crearla exige aceptar los términos y ser mayor de edad', async ({
    page,
  }) => {
    await page.goto('/auth/register');
    await page.getByLabel('Nombre', { exact: true }).fill('Prueba');
    await page.getByLabel('Apellidos').fill('Registro');
    await page.getByLabel('Correo electrónico').fill(correoNuevo());
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await page.getByLabel('Confirmar contraseña').fill(CLAVE);

    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(
      page.getByText('tienes que ser mayor de edad y aceptar los términos'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/register/);

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await page.waitForURL((url) => !url.pathname.includes('/auth/register'));
  });

  test('el perfil de un cliente carga, y la contraseña se cambia', async ({
    page,
    request,
  }) => {
    // Pedía /users/:id, que es de administración: a clientes y
    // profesionales el perfil no les llegaba a cargar.
    const email = await cuentaNueva(request);
    await entrar(page, email, CLAVE);
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'));

    await page.goto('/dashboard/profile');
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
      'Prueba',
    );

    await page.getByLabel('Contraseña actual').fill(CLAVE);
    await page
      .getByLabel('Contraseña nueva', { exact: true })
      .fill('Nueva12345!');
    await page.getByLabel('Repite la contraseña nueva').fill('Nueva12345!');
    await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
    await expect(
      page.getByText('Contraseña cambiada. Se han cerrado tus otras sesiones.'),
    ).toBeVisible();

    // Con la vieja ya no se entra; con la nueva, sí.
    await page.context().clearCookies();
    await entrar(page, email, CLAVE);
    await expect(page.getByText('Verifica tus credenciales')).toBeVisible();
    await entrar(page, email, 'Nueva12345!');
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'));
  });

  test('tras diez contraseñas equivocadas se frena, y la página lo explica', async ({
    page,
    request,
  }) => {
    // El límite por visitante no protege una cuenta de quien reparte los
    // intentos entre muchas direcciones: este sí. Con una cuenta propia,
    // porque las de demostración quedan fuera a propósito.
    const email = await cuentaNueva(request);
    for (let intento = 0; intento < 10; intento += 1) {
      const respuesta = await request.post(`${API}/auth/token`, {
        data: { email, password: 'No-es-esta1!' },
      });
      expect(respuesta.status()).toBe(401);
    }

    // Ni con la buena: si pasara, el freno no frenaría a quien las va
    // probando.
    await entrar(page, email, CLAVE);

    await expect(
      page.getByRole('alert').filter({
        hasText: 'Demasiados intentos fallidos con esta cuenta',
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('eliminarla cierra la sesión, y ya no se puede entrar', async ({
    page,
    request,
  }) => {
    const email = await cuentaNueva(request);
    await entrar(page, email, CLAVE);
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'));

    await page.goto('/dashboard/profile');
    await page.getByLabel('Escribe tu contraseña para confirmar').fill(CLAVE);
    page.once('dialog', (dialogo) => dialogo.accept());
    await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();

    await expect(page.getByText('Tu cuenta se ha eliminado.')).toBeVisible();
    await entrar(page, email, CLAVE);
    await expect(page.getByText('Verifica tus credenciales')).toBeVisible();
  });

  test('sin correo configurado, recuperar la contraseña lo dice', async ({
    page,
  }) => {
    // La API de las pruebas arranca en modo producción y sin clave de
    // Brevo: en vez de fingir que el enlace salió, responde que no está
    // disponible, y la pantalla lo explica.
    await page.goto('/auth/login');
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
    await expect(page).toHaveURL(/\/auth\/recuperar/);

    await page.getByLabel('Correo electrónico').fill(correoNuevo());
    await page.getByRole('button', { name: 'Enviar el enlace' }).click();

    // Filtrado por el texto: al navegar dentro de la aplicación, Next añade
    // su anunciador de rutas, que también es un «alert».
    await expect(
      page.getByRole('alert').filter({
        hasText: 'La recuperación por correo todavía no está disponible',
      }),
    ).toBeVisible();
  });

  test('una cuenta de demostración no ofrece cambiar la contraseña ni eliminarla', async ({
    page,
  }) => {
    await entrarComo(page, 'cliente');
    await page.goto('/dashboard/profile');

    await expect(
      page.getByText('Esta es una cuenta de demostración compartida'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Eliminar mi cuenta' }),
    ).toHaveCount(0);
  });
});
