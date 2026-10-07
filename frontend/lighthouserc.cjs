/**
 * Lighthouse en la integración continua: rendimiento, accesibilidad, buenas
 * prácticas y SEO de las páginas por las que entra la gente.
 *
 * Nada medía el rendimiento: el README contaba un buscador servido desde el
 * servidor y fichas que llegan pintadas, pero ninguna cifra lo respaldaba, y
 * una regresión de peso o de tiempo de carga no la habría visto nadie. Cada
 * página se mide tres veces y vale la mediana, porque una sola pasada en un
 * runner compartido varía de más.
 *
 * Contra la aplicación compilada y la API en marcha, igual que las pruebas de
 * extremo a extremo. LHCI_FICHA es el identificador de un servicio sembrado:
 * la semilla los crea nuevos cada vez.
 */
const BASE = process.env.LHCI_BASE || 'http://localhost:3000';
const FICHA = process.env.LHCI_FICHA;

module.exports = {
  ci: {
    collect: {
      url: [
        `${BASE}/`,
        `${BASE}/services/search`,
        ...(FICHA ? [`${BASE}/services/${FICHA}`] : []),
        `${BASE}/auth/login`,
      ],
      numberOfRuns: 3,
      settings: {
        // El navegador del runner no tiene espacio de usuario aislado.
        chromeFlags: '--no-sandbox',
      },
    },
    // La mediana de las tres pasadas de cada página. Un suelo, no una meta:
    // el rendimiento se deja unos puntos por debajo de lo medido en local
    // (0,90 a 0,92 con el móvil que simula Lighthouse), porque el runner de
    // la CI es más lento y más variable.
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          assertions: {
            'categories:performance': [
              'error',
              { minScore: 0.85, aggregationMethod: 'median-run' },
            ],
            'categories:accessibility': [
              'error',
              { minScore: 1, aggregationMethod: 'median-run' },
            ],
            'categories:best-practices': [
              'error',
              { minScore: 0.95, aggregationMethod: 'median-run' },
            ],
          },
        },
        {
          // Las de acceso llevan noindex a propósito: no hay nada que
          // indexar, así que el SEO solo se exige en las públicas.
          matchingUrlPattern: '^((?!/auth/).)*$',
          assertions: {
            'categories:seo': [
              'error',
              { minScore: 1, aggregationMethod: 'median-run' },
            ],
          },
        },
      ],
    },
    upload: {
      // A disco, y de ahí al artefacto del trabajo. El almacenamiento
      // temporal público de Lighthouse publicaría los informes en abierto.
      target: 'filesystem',
      outputDir: './lighthouse',
    },
  },
};
