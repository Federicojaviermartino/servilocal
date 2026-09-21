import { Page } from '@playwright/test';

/**
 * Entrar con una de las cuentas de demostración.
 *
 * Estaba copiado en cuatro specs, con lo que cambiar la pantalla de acceso
 * obligaba a tocar los cuatro y a acordarse de todos. Los botones enseñan el
 * papel, su descripción y el correo, así que se busca por el correo: es lo
 * único que identifica a una cuenta sin ambigüedad.
 *
 * El botón redirige a la portada, y hay que esperar a que llegue: ir a una
 * ruta protegida antes de tiempo rebota a la pantalla de acceso y deja el
 * test mirando la página equivocada.
 */
export const CUENTAS_DEMO = {
  administracion: 'demo@servilocal.com',
  cliente: 'laura@ejemplo.com',
  profesional: 'carlos@ejemplo.com',
} as const;

export type PapelDemo = keyof typeof CUENTAS_DEMO;

export async function entrarComo(page: Page, papel: PapelDemo): Promise<void> {
  await page.goto('/auth/login');
  await page
    .getByRole('button', { name: new RegExp(CUENTAS_DEMO[papel]) })
    .click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/login'));
}
