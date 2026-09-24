import { test, expect } from '@playwright/test';
import { entrarComo } from './ayudas';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

test.describe('La sesión', () => {
  test('va en una cookie que JavaScript no puede leer', async ({
    page,
    context,
  }) => {
    const acceso = page.waitForResponse((r) =>
      r.url().endsWith('/api/auth/login'),
    );
    await entrarComo(page, 'cliente');

    // Los atributos, tal como llegan al navegador a través del frontend. Se
    // miran en la cabecera y no en el almacén de cookies porque el WebKit de
    // Playwright para Windows no guarda SameSite y lo devuelve siempre como
    // None, aunque la cabecera diga otra cosa.
    const puesta = (await (await acceso).headerValue('set-cookie')) ?? '';
    expect(puesta).toMatch(/^sesion=/);
    expect(puesta).toMatch(/;\s*HttpOnly/i);
    expect(puesta).toMatch(/;\s*SameSite=Lax/i);

    const sesion = (await context.cookies()).find((c) => c.name === 'sesion');
    expect(sesion, 'hay cookie de sesión').toBeTruthy();
    expect(sesion!.httpOnly).toBe(true);
    // Del frontend y no de la API: si fuera de la API, para el navegador
    // sería de otro sitio, y Safari no la mandaría.
    expect(sesion!.domain).toBe(new URL(page.url()).hostname);

    const alAlcance = await page.evaluate(() => ({
      cookies: document.cookie,
      almacen: Object.keys(localStorage)
        .map((clave) => localStorage.getItem(clave))
        .join(' '),
    }));
    expect(alAlcance.cookies).not.toContain('sesion=');
    expect(alAlcance.almacen).not.toContain(sesion!.value);
    expect(alAlcance.almacen).not.toMatch(/eyJ/);
  });

  test('las llamadas a la API pasan por el propio frontend', async ({
    page,
  }) => {
    const directas: string[] = [];
    page.on('request', (peticion) => {
      const url = peticion.url();
      // El socket sí va directo, con su pase: no lleva la cookie.
      if (url.startsWith(new URL(API).origin) && !url.includes('/socket.io/')) {
        directas.push(url);
      }
    });

    await entrarComo(page, 'cliente');
    const reservas = page.waitForResponse((r) =>
      r.url().includes('/bookings/my'),
    );
    await page.goto('/dashboard/bookings');
    const respuesta = await reservas;

    // Contesta la API de verdad, con la cookie, a través del frontend.
    expect(new URL(respuesta.url()).origin).toBe(new URL(page.url()).origin);
    expect(respuesta.status()).toBe(200);
    expect(directas).toEqual([]);
  });

  test('al salir, la cookie se borra', async ({ page, context }) => {
    await entrarComo(page, 'cliente');

    await page.evaluate(() =>
      fetch('/api/auth/logout', { method: 'POST' }).then((r) => r.status),
    );

    const nombres = (await context.cookies()).map((c) => c.name);
    expect(nombres).not.toContain('sesion');
  });

  test('al salir, una copia de la cookie ya no sirve', async ({
    page,
    context,
    request,
  }) => {
    // Borrar la cookie solo cierra este navegador. La sesión se cierra en
    // el servidor, así que quien se hubiera guardado el valor antes tampoco
    // entra.
    await entrarComo(page, 'cliente');
    const copia = (await context.cookies()).find((c) => c.name === 'sesion');
    expect(copia, 'hay cookie de sesión').toBeTruthy();

    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));

    const conLaCopia = await request.get('/api/auth/profile', {
      headers: { cookie: `sesion=${copia!.value}` },
    });
    expect(conLaCopia.status()).toBe(401);
  });
});

test.describe('Acceso a la aplicación', () => {
  test('el acceso de demostración entra como cliente', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByText('Acceso de demostración')).toBeVisible();

    await page.getByRole('button', { name: /laura@ejemplo\.com/ }).click();

    // Se comprueba en el panel y no en la cabecera: en móvil el nombre queda
    // dentro del menú plegado y no sería visible.
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await page.goto('/dashboard');
    await expect(
      page.getByRole('heading', { name: /Hola, Laura/ }),
    ).toBeVisible();
  });

  test('el acceso de demostración entra como profesional', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /carlos@ejemplo\.com/ }).click();
    await expect(page).not.toHaveURL(/\/auth\/login/);

    await page.goto('/dashboard/services');
    await expect(
      page.getByRole('heading', { name: 'Mis servicios' }),
    ).toBeVisible();
  });

  test('unas credenciales incorrectas muestran el error y no entran', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Correo electrónico').fill('laura@ejemplo.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('el panel exige sesión', async ({ page }) => {
    await page.goto('/dashboard/bookings');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
