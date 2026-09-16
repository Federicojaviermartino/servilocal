import { test, expect, APIRequestContext, Page } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const CLAVE = 'Password123!';

/** Los identificadores de la semilla cambian en cada siembra: se preguntan. */
async function identificar(peticion: APIRequestContext, email: string) {
  const respuesta = await peticion.post(`${API}/auth/login`, {
    data: { email, password: CLAVE },
  });
  expect(respuesta.ok()).toBeTruthy();
  const { user } = await respuesta.json();
  return user.id as string;
}

async function entrarComo(page: Page, boton: string) {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: boton, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'));
}

test.describe('Mensajería en tiempo real', () => {
  test('un mensaje aparece en la otra pantalla sin recargar', async ({
    browser,
    request,
  }) => {
    const idCliente = await identificar(request, 'laura@ejemplo.com');
    const idProfesional = await identificar(request, 'carlos@ejemplo.com');

    // Dos contextos y no dos pestañas: cada uno tiene su propio
    // almacenamiento, que es lo que permite dos sesiones distintas a la vez.
    const contextoCliente = await browser.newContext();
    const contextoProfesional = await browser.newContext();

    try {
      const cliente = await contextoCliente.newPage();
      const profesional = await contextoProfesional.newPage();

      await entrarComo(cliente, 'Cliente');
      await entrarComo(profesional, 'Profesional');

      await cliente.goto(`/dashboard/messages/${idProfesional}`);
      await profesional.goto(`/dashboard/messages/${idCliente}`);

      const texto = `Comprobación en vivo ${Date.now()}`;
      await profesional.getByRole('textbox').last().fill(texto);
      await profesional.getByRole('button', { name: /Enviar/i }).click();

      // Lo que se está comprobando de verdad: llega solo. Si esto tardara
      // más de lo razonable estaría llegando por el sondeo de respaldo, que
      // es precisamente lo que el socket viene a sustituir.
      await expect(cliente.getByText(texto)).toBeVisible({ timeout: 5000 });

      // Y quien escribe también lo ve: el mensaje propio vuelve por el
      // socket, sin pintarlo por adelantado ni recargar la conversación.
      await expect(profesional.getByText(texto)).toBeVisible();
    } finally {
      await contextoCliente.close();
      await contextoProfesional.close();
    }
  });
});
