import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Vitest y no Jest, desde NestJS 12.
 *
 * Los paquetes de Nest 12 se publican solo como ESM. La aplicación sigue en
 * CommonJS —Node los carga igual desde la 22.12—, pero Jest tiene su propio
 * sistema de módulos y solo puede cargarlos a partir de Node 24.9. Quedarse
 * en Jest obligaba a probar con un Node distinto del que corre en
 * producción. Vitest los carga de forma nativa, y es además el corredor que
 * ya usa el frontend: uno solo para todo el repositorio.
 *
 * SWC y no el compilador por defecto de Vitest porque la inyección de
 * dependencias de Nest lee los tipos de los constructores de los metadatos
 * que emiten los decoradores, y esbuild no los emite. Sin esto, cualquier
 * prueba que monte un módulo recibe undefined en lugar de sus dependencias.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // La primera prueba de cada fichero monta el módulo de Nest en frío, y
    // con todos los ficheros arrancando a la vez eso pasó de los 5 segundos
    // por defecto en dos de ellos. Por separado tardan 3. Es la carga, no la
    // prueba: con 15 sigue habiendo tope para lo que de verdad se cuelgue.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      // Lo que decide qué ve y qué puede hacer quien llama: servicios,
      // guardias, interceptores, filtros, el webhook de pagos y los
      // transformadores de columnas. Es la misma selección que tenía Jest.
      include: [
        'src/**/*.service.ts',
        'src/**/guards/**/*.ts',
        'src/**/interceptores/**/*.ts',
        'src/**/filters/**/*.ts',
        'src/**/payments-webhook.controller.ts',
        'src/**/transformers/**/*.ts',
        // Qué credenciales se quitan antes de enviar nada a Sentry.
        'src/common/observabilidad/sentry.ts',
      ],
      exclude: ['src/**/*.spec.ts'],
      reportsDirectory: 'coverage',
      // Los mismos umbrales que con Jest. Cambiar de corredor no es motivo
      // para bajarlos.
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
        'src/auth/auth.service.ts': { statements: 85, branches: 75 },
        'src/common/guards/roles.guard.ts': { statements: 90, branches: 100 },
      },
    },
  },
});
