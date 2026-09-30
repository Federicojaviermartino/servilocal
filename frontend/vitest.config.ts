import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Vitest y no Jest.
 *
 * next-intl y use-intl se publican solo como ESM, y Jest necesitaría modo
 * experimental y un sustituto en cada prueba de un componente que traduzca,
 * que son casi todos. Vitest ejecuta ESM de forma nativa y se acabó el
 * problema.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // next-intl resuelve «next/navigation» sin extensión, que Node rechaza
    // en ESM. Procesándolo Vite, lo resuelve su propio resolutor y deja de
    // ser un problema.
    server: { deps: { inline: ['next-intl', 'use-intl'] } },
    // Los de extremo a extremo los ejecuta Playwright.
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    // Con 5 segundos por prueba, las dos pasadas completas en local salieron
    // rojas, y cada una con pruebas distintas: el tiempo que se agotaba era
    // el de la máquina, no el del código. En la CI pasaban. Con 15 queda
    // tope para lo que de verdad se cuelgue, como en el backend. La espera
    // de findBy y waitFor sube a 3 segundos en vitest.setup.ts.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      // Las páginas también: medir solo lib y components dejaba fuera el
      // registro, el pago o las reservas recibidas, y la cifra no se movía
      // aunque se quedaran sin una sola prueba. Los layouts solo ponen
      // metadatos y los prueba el navegador.
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/components/**/*.tsx',
        'src/app/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.stories.tsx',
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/app/**/layout.tsx',
      ],
      // Un suelo, no una meta: se deja unos puntos por debajo de lo medido
      // para que añadir un componente no rompa la integración antes de que
      // le dé tiempo a nadie a escribirle su prueba. Bajarlo para que pase
      // algo que no está probado vacía de sentido la comprobación entera.
      thresholds: {
        statements: 91,
        branches: 88,
        functions: 87,
        lines: 93,
        // Y un suelo propio para lo que no puede fallar sin que se note: a
        // qué página se vuelve tras entrar (un «redirect» sin comprobar
        // lleva a una web ajena), qué se dice ante cada error y la página
        // de pago. El global es una media, y una media tapa una rama
        // entera sin probar en un fichero pequeño.
        'src/lib/ruta-interna.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
        },
        'src/lib/errores-api.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
        },
        'src/lib/aviso-de-fallo.tsx': {
          statements: 100,
          branches: 100,
          functions: 100,
        },
        'src/app/[[]locale]/bookings/[[]id]/payment/page.tsx': {
          statements: 95,
          branches: 85,
        },
      },
    },
  },
});
