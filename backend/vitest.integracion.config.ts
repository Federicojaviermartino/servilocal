import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * Las pruebas contra PostgreSQL y el emulador de Stripe.
 *
 * Una detrás de otra: comparten la misma base, y dos a la vez se pisarían
 * las filas. Con un minuto de margen por prueba, porque las de concurrencia
 * esperan a propósito a que una transacción suelte un bloqueo.
 *
 * Se copia la configuración base en vez de mezclarla con mergeConfig, que
 * suma las listas: el include acabaría corriendo también las unitarias.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['test/integracion/**/*.integracion.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: { enabled: false },
  },
});
