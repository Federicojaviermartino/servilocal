import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * La evaluación del asistente con el modelo de verdad: ver
 * src/ia/evaluacion/modelo.evaluacion.ts. Aparte de la batería normal porque
 * cada caso es una llamada de pago.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.evaluacion.ts'],
    testTimeout: 600000,
    coverage: { enabled: false },
  },
});
