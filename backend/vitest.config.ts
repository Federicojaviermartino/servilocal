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
      // Todo el código, salvo lo que se prueba por otro camino.
      //
      // Antes era una lista cerrada de ficheros, y lo que no estaba en ella
      // no contaba: fuera se quedaban los controladores, qué datos ve cada
      // parte de una reserva (partes-visibles.ts) o la barrera de la
      // semilla. Tenían pruebas, pero borrarlas no lo habría notado nadie.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        // Arrancan y declaran; los monta enteros la prueba de permisos de
        // la integración, y la imagen la arranca y la apaga la CI.
        'src/main.ts',
        'src/**/*.module.ts',
        // Solo decoradores. El esquema que describen se compara con el de
        // las migraciones, y las migraciones se aplican y se deshacen
        // enteras, en la integración.
        'src/entities/**',
        'src/database/migrations/**',
        'src/config/data-source.ts',
        // La semilla la ejecuta la CI antes de la integración y de las
        // pruebas de extremo a extremo. Su barrera sí se mide.
        'src/database/seeds/run-seed.ts',
        // La evaluación del asistente con el modelo de verdad, que se lanza
        // a mano: npm run evaluar:ia.
        'src/**/*.evaluacion.ts',
      ],
      reportsDirectory: 'coverage',
      // Unos puntos por debajo de lo medido. Con el suelo en 90 y 80, cabía
      // un servicio nuevo entero sin una sola prueba sin que la cifra bajara
      // del mínimo.
      thresholds: {
        statements: 96,
        branches: 89,
        functions: 97,
        lines: 96,
        // Y un suelo propio para lo que mueve dinero, decide quién puede
        // qué o qué datos personales salen. El global es una media: un
        // fichero grande y bien probado podía tapar que a uno de estos se le
        // quedara una rama entera sin prueba.
        'src/payments/payments.service.ts': {
          statements: 95,
          branches: 89,
          functions: 95,
        },
        'src/bookings/bookings.service.ts': {
          statements: 96,
          branches: 89,
          functions: 98,
        },
        'src/users/users.service.ts': {
          statements: 98,
          branches: 85,
          functions: 98,
        },
        'src/auth/auth.service.ts': { statements: 95, branches: 90 },
        'src/common/guards/**': {
          statements: 100,
          branches: 100,
          functions: 100,
        },
        'src/common/interceptores/**': {
          statements: 100,
          branches: 92,
          functions: 100,
        },
        'src/bookings/partes-visibles.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
        },
        'src/services/servicio-publico.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
        },
        'src/common/demostracion.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
        },
      },
    },
  },
});
