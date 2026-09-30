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
  // En integración continua se reintenta, pero ya no para salir en verde:
  // una prueba que falla y pasa al repetirla es intermitente, y eso también
  // es un fallo. Una intermitencia es un error real que a veces no se ve, o
  // una prueba que no prueba lo que dice, y con solo un aviso nadie tenía
  // que mirarla. El reintento sirve para distinguirla de un fallo fijo y
  // para grabar la traza.
  retries: process.env.CI ? 2 : 0,
  failOnFlakyTests: !!process.env.CI,
  // Un test.only olvidado dejaba las 416 ejecuciones en unas pocas, y en
  // verde. En la CI, un .only es un fallo.
  forbidOnly: !!process.env.CI,
  // Un solo worker también en local, igual que en integración continua.
  // Varias pruebas comparten las cuentas de demostración —crean reservas con
  // ellas y esperan el aviso por su socket—, así que en paralelo la de
  // escritorio y la de móvil se pisan y fallan de forma intermitente. Antes
  // eso solo se veía aquí y no allí, que es la peor manera de tener un test
  // rojo: el que te hace dudar de si el fallo es de verdad.
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  // En integración continua, también en JSON: de ahí sale el resumen del
  // trabajo, con las pruebas intermitentes por su nombre.
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'playwright-report/resultados.json' }],
      ]
    : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'es-ES',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'escritorio',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'movil',
      use: { ...devices['Pixel 5'] },
    },
    // Los otros dos motores. Safari es la razón de que la API se llame a
    // través del propio frontend: bloquea las cookies de otro sitio, y sin
    // probar en WebKit eso era una suposición.
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'safari',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 },
      },
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
