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
        // La cookie de sesión, a quién cree el limitador detrás del proxy y
        // qué credenciales se quitan antes de enviar nada a Sentry.
        'src/auth/sesion.ts',
        'src/common/proxy-frontend.ts',
        'src/common/observabilidad/sentry.ts',
        'src/common/observabilidad/peticion.ts',
        // Cómo se entiende un mensaje del asistente, con el modelo y sin él.
        'src/ia/interpretacion.ts',
        // Quién entra, a quién le llegan los mensajes en vivo, cuándo se
        // renueva el dinero retenido y con qué se conecta a la base. Tenían
        // pruebas, pero no se medían: borrarlas no lo habría notado nadie.
        'src/auth/strategies/**/*.ts',
        'src/**/*.gateway.ts',
        'src/payments/programador-retenciones.ts',
        'src/config/conexion-segura.ts',
        'src/config/entorno.ts',
      ],
      exclude: ['src/**/*.spec.ts'],
      reportsDirectory: 'coverage',
      // Unos puntos por debajo de lo medido (97 % de sentencias y 91 % de
      // ramas). Con el suelo en 90 y 80, cabía un servicio nuevo entero sin
      // una sola prueba sin que la cifra bajara del mínimo.
      thresholds: {
        statements: 95,
        branches: 89,
        functions: 94,
        lines: 95,
        'src/auth/auth.service.ts': { statements: 85, branches: 75 },
        'src/common/guards/roles.guard.ts': { statements: 90, branches: 100 },
      },
    },
  },
});
