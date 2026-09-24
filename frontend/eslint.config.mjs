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
];

export default configuracion;
