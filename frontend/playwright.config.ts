import { defineConfig, devices } from '@playwright/test';

/**
 * Los tests se ejecutan contra la aplicación compilada, no contra el servidor
 * de desarrollo, porque NEXT_PUBLIC_API_URL se incrusta al compilar: arrancar
 * en desarrollo probaría una configuración distinta de la que se despliega.
 *
 * El puerto 3000 no es casual: es el que acepta CORS_ORIGINS de la API.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Un fallo aislado suele ser lentitud de la instancia gratuita, no una
  // regresión: se reintenta en integración continua antes de darlo por malo.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'es-ES',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'movil',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // El script `start` del paquete usa ${PORT:-3000}, expansión de shell
        // que Render resuelve pero Windows no: aquí se fija el puerto.
        command: 'npx next start -p 3000',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
