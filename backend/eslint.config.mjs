import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierRecomendado from 'eslint-plugin-prettier/recommended';

/**
 * ESLint con la configuración plana.
 *
 * Las reglas recomendadas de ESLint y las de typescript-eslint, con su nivel
 * de fábrica, y Prettier como una regla más. El lint no admite avisos: `any`
 * fue un aviso mientras quedaban treinta y siete, y un aviso que se tolera
 * hoy es costumbre mañana. Ya no queda ninguno.
 *
 * Mira todo el paquete, pruebas de integración incluidas: antes solo src/, y
 * en test/ se quedaban sin ver cosas como un import que ya no usaba nadie.
 *
 * ESLint va en la 10 y el frontend sigue en la 9: allí lo frenan los plugins
 * que trae la configuración de Next, que aquí no están.
 */
export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettierRecomendado,
  {
    rules: {
      // ignoreRestSiblings permite `const { password, ...resto } = usuario`
      // para quitar campos sensibles sin que la variable cuente como no usada.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Los globales de Vitest. Con TypeScript no-undef está desactivado y esto
    // no cambia qué se señala: se declara para que quien lea la configuración
    // sepa con qué corren las pruebas.
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: {
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
      },
    },
  },
]);
