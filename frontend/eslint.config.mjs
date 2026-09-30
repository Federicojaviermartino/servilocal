import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * ESLint con la configuración plana.
 *
 * Next 16 quitó `next lint` y su configuración de ESLint ya solo viene en este
 * formato. Con ella llegan las reglas nuevas de react-hooks, las del
 * compilador de React, y encontraron cosas de verdad: el anuncio de los
 * avisos en vivo para lectores de pantalla dependía de que React ejecutara
 * en el acto la función que actualiza el estado, y no salía. Arreglado.
 *
 * Todas las reglas con su nivel de fábrica. set-state-in-effect estuvo un
 * tiempo rebajada a aviso mientras dieciocho cargas de datos ponían el
 * «cargando» dentro de un efecto; ya no queda ninguna. Y el lint no admite
 * avisos: uno que se tolera hoy es costumbre mañana.
 */
const configuracion = [
  ...nextCoreWebVitals,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'coverage/**',
      'storybook-static/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    // Un .only olvidado deja fuera todas las demás pruebas del fichero, y en
    // local nadie lo nota porque lo que queda pasa. Vitest ya se niega a
    // correrlo en la CI, y Playwright también (forbidOnly); esto lo para
    // antes, en el editor.
    files: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='only']:matches([object.name=/^(describe|it|test)$/], [object.property.name='describe'])",
          message:
            'Un .only deja fuera el resto de las pruebas. Quítalo antes de subir.',
        },
      ],
    },
  },
];

export default configuracion;
