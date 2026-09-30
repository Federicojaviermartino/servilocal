// Resume el informe JSON de Playwright en el resumen del trabajo, y deja un
// aviso por cada prueba intermitente.
//
// Una prueba que falla y pasa al reintentarla pone el trabajo en rojo
// (failOnFlakyTests, en playwright.config.ts): una intermitencia es un fallo
// real que a veces no se ve, o una prueba que no prueba lo que dice. Aquí
// queda con su nombre, separada de las que fallan siempre, para no tener que
// buscarla en el registro.
//
// Uso: node scripts/resumen-playwright.mjs <informe.json>
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [ruta] = process.argv.slice(2);
const destino = process.env.GITHUB_STEP_SUMMARY;
const escribir = (texto) =>
  destino ? appendFileSync(destino, `${texto}\n`) : console.log(texto);

if (!ruta || !existsSync(ruta)) {
  escribir('## Extremo a extremo\n\nNo hay informe: Playwright no llegó a terminar.');
  process.exit(0);
}

const informe = JSON.parse(readFileSync(ruta, 'utf-8'));

/** Cada prueba con su ruta de títulos y su proyecto, recorriendo el árbol. */
function* pruebas(suite, camino = []) {
  const titulos = suite.title ? [...camino, suite.title] : camino;
  for (const spec of suite.specs ?? []) {
    for (const prueba of spec.tests ?? []) {
      yield {
        nombre: [...titulos, spec.title].join(' › '),
        proyecto: prueba.projectName,
        estado: prueba.status,
      };
    }
  }
  for (const hija of suite.suites ?? []) yield* pruebas(hija, titulos);
}

const todas = (informe.suites ?? []).flatMap((suite) => [...pruebas(suite)]);
const intermitentes = todas.filter((p) => p.estado === 'flaky');
const fallidas = todas.filter((p) => p.estado === 'unexpected');
const { expected = 0, skipped = 0, duration = 0 } = informe.stats ?? {};

escribir('## Extremo a extremo\n');
escribir('| Pasan | Fallan | Intermitentes | Omitidas | Minutos |');
escribir('|---|---|---|---|---|');
escribir(
  `| ${expected} | ${fallidas.length} | ${intermitentes.length} | ${skipped} | ${(duration / 60000).toFixed(1)} |`,
);

for (const [titulo, lista] of [
  ['Fallan', fallidas],
  ['Intermitentes: fallaron y pasaron al reintentarlas', intermitentes],
]) {
  if (lista.length === 0) continue;
  escribir(`\n### ${titulo}\n`);
  for (const p of lista) escribir(`- \`${p.proyecto}\` ${p.nombre}`);
}

for (const p of intermitentes) {
  console.log(`::warning title=Prueba intermitente::[${p.proyecto}] ${p.nombre}`);
}
