// Las pruebas de mutación de todas las áreas, una detrás de otra.
//
//   npm run test:mutacion            (todas)
//   npm run test:mutacion -- pagos   (solo esas)
//
// Cada área es una pasada de Stryker con sus mutantes y sus pruebas: ver
// stryker.config.mjs. Sale con error si alguna queda por debajo del suelo.
import { spawnSync } from 'node:child_process';

const TODAS = ['privacidad', 'permisos', 'reservas', 'pagos'];
const pedidas = process.argv.slice(2);
const areas = pedidas.length > 0 ? pedidas : TODAS;

const fallidas = [];
for (const area of areas) {
  console.log(`\n=== Mutación: ${area}\n`);
  const { status } = spawnSync('npx', ['stryker', 'run'], {
    env: { ...process.env, MUTAR: area },
    stdio: 'inherit',
    shell: true,
  });
  if (status !== 0) fallidas.push(area);
}

if (fallidas.length > 0) {
  console.error(`\nPor debajo del suelo o con error: ${fallidas.join(', ')}`);
  process.exit(1);
}
console.log('\nInformes en reports/mutacion/.');
