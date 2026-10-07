/**
 * Pruebas de mutación: si las pruebas detectan un fallo de verdad, no solo
 * si pasan por cada línea.
 *
 * La cobertura dice qué código se ejecuta durante las pruebas, no si alguna
 * fallaría al cambiarlo. Stryker cambia el código a propósito —un > por un
 * >=, un && por un ||, una condición por true— y vuelve a pasar las pruebas:
 * cada cambio que sobrevive es un fallo que nadie habría visto.
 *
 * Sobre lo que mueve dinero, decide quién puede qué o qué datos personales
 * salen, por áreas, y cada una con solo sus pruebas: la batería entera por
 * cada mutante tardaría horas. Es lento igualmente, así que no corre en cada
 * empujón: a mano, con `npm run test:mutacion`, o desde la pestaña de
 * acciones.
 *
 * Con el ejecutor genérico y no con el de Vitest: el de Vitest no llegaba a
 * activar los mutantes con Vitest 5, y todos sobrevivían. El genérico lanza
 * Vitest como proceso aparte y le dice el mutante activo por el entorno.
 *
 *   MUTAR=pagos npx stryker run      (una sola área)
 */
const AREAS = {
  permisos: {
    mutate: [
      'src/common/guards/*.ts',
      'src/common/interceptores/*.ts',
      'src/common/demostracion.ts',
      'src/common/cuenta.ts',
    ],
    pruebas: [
      'src/common/guards',
      'src/common/interceptores',
      'src/common/demostracion.spec.ts',
      'src/common/cuenta.spec.ts',
      'src/auth',
      'src/users/users.service.spec.ts',
    ],
    suelo: 90,
  },
  privacidad: {
    mutate: [
      'src/bookings/partes-visibles.ts',
      'src/services/servicio-publico.ts',
    ],
    pruebas: ['src/bookings/partes-visibles.spec.ts', 'src/services'],
    suelo: 95,
  },
  reservas: {
    mutate: ['src/bookings/bookings.service.ts'],
    pruebas: ['src/bookings'],
    suelo: 82,
  },
  pagos: {
    mutate: ['src/payments/payments.service.ts'],
    pruebas: ['src/payments'],
    suelo: 77,
  },
};

const area = process.env.MUTAR;
if (!AREAS[area]) {
  throw new Error(
    `MUTAR tiene que ser una de: ${Object.keys(AREAS).join(', ')}. Para todas: npm run test:mutacion.`,
  );
}

export default {
  testRunner: 'command',
  commandRunner: {
    command: `npx vitest run ${AREAS[area].pruebas.join(' ')}`,
  },
  coverageAnalysis: 'off',
  mutate: [...AREAS[area].mutate, '!src/**/*.spec.ts'],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: `reports/mutacion/${area}.html` },
  jsonReporter: { fileName: `reports/mutacion/${area}.json` },
  // Un suelo por área, como los de la cobertura: unos cinco puntos por
  // debajo de lo medido —privacidad 100 %, permisos 95,7 %, reservas 87,1 %,
  // pagos 82,0 %—, para que una prueba que deja de comprobar algo se note.
  thresholds: { high: 85, low: 75, break: AREAS[area].suelo },
  // Holgado: un mutante que agota el tiempo cuenta como detectado, y con
  // todos los núcleos ocupados una pasada normal se acercaba al minuto. Con
  // un límite justo, la puntuación subía sin que las pruebas hubieran
  // detectado nada.
  timeoutMS: 120000,
  tempDirName: '.stryker-tmp',
};
