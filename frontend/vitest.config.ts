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
      include: ['src/lib/**/*.ts', 'src/components/**/*.tsx'],
      exclude: [
        'src/**/*.stories.tsx',
        'src/**/*.d.ts',
        'src/lib/auth-store.ts',
      ],
      thresholds: {
        statements: 20,
        branches: 26,
        functions: 16,
        lines: 20,
      },
    },
  },
});
