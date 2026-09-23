import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * ESLint con la configuración plana.
 *
 * Next 16 quitó `next lint` y su configuración de ESLint ya solo viene en este
 * formato. Con ella llegan las reglas nuevas de react-hooks, las del
 * compilador de React, y encontraron cosas de verdad: el anuncio de los
 * avisos en vivo para lectores de pantalla dependía de que React ejecutara
 * en el acto la función que actualiza el estado, y no salía. Arreglado.
 */
const configuracion = [
  ...nextCoreWebVitals,
  {
    rules: {
      // Dieciocho pantallas cargan datos poniendo el estado de «cargando»
      // dentro de un efecto. La regla avisa de que eso provoca un render de
      // más, y tiene razón, pero corregirlo es rehacer la carga de datos de
      // dieciocho pantallas: merece su propio cambio y no ir colado en una
      // migración. Se queda como aviso, a la vista, no apagada.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
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
];

export default configuracion;
