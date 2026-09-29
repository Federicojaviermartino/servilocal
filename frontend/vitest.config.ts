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
        statements: 89,
        branches: 87,
        functions: 84,
        lines: 90,
      },
    },
  },
});
