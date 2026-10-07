#!/usr/bin/env node
/**
 * Regenera el package-lock.json del paquete actual dentro de Linux y comprueba
 * que npm ci lo acepta.
 *
 * Por qué hace falta: npm resuelve las dependencias de pares de forma distinta
 * según el sistema operativo. ESLint necesita ajv 6 y las herramientas de
 * webpack que trae Storybook, ajv 8, cada uno con su ajv-keywords como par, y
 * dónde acaba cada copia depende de cómo se resuelvan esos pares: un lockfile
 * escrito en Windows lo rechazaba npm ci en Linux con EUSAGE, antes siquiera
 * de descargar nada. Con @swc/helpers pasaba lo mismo hasta que Next pasó a
 * una versión que satisface a los dos. Como aquí se desarrolla en Windows y se
 * despliega en Linux, el lockfile tiene que generarse donde se va a consumir.
 *
 * Las banderas --os y --cpu de npm no sirven: solo filtran las dependencias
 * opcionales por plataforma, no cambian cómo se resuelven los pares.
 *
 * Uso, desde frontend/ o desde backend/:
 *   npm run lock
 *   npm run lock -- sharp source-map-js   (además, sube esos paquetes)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const IMAGEN = 'node:22';
const paquete = process.cwd();

// Paquetes que subir a lo último que admitan sus rangos, también los que
// llegan de rebote. Con el lockfile copiado, npm no toca lo que ya cumple, y
// un aviso de seguridad en una dependencia transitiva —sharp, que trae Next;
// source-map-js, que trae PostCSS— necesita subirla sin cambiar nada más.
const subir = process.argv.slice(2);
const NOMBRE_NPM = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const raro = subir.find((nombre) => !NOMBRE_NPM.test(nombre));
if (raro) {
  console.error(`«${raro}» no es el nombre de un paquete de npm.`);
  process.exit(1);
}

if (!existsSync(resolve(paquete, 'package.json'))) {
  console.error(
    'No hay package.json aquí. Ejecútalo desde frontend/ o desde backend/.',
  );
  process.exit(1);
}

const docker = (args, opciones = {}) =>
  spawnSync('docker', args, { stdio: 'inherit', shell: false, ...opciones });

const disponible = docker(['info', '--format', '{{.OSType}}'], {
  stdio: 'pipe',
});

if (disponible.status !== 0) {
  console.error(
    'Docker no responde. Hace falta para generar el lockfile en Linux:\n' +
      '  - Arranca Docker Desktop y vuelve a intentarlo.\n' +
      '  - Si no puedes usar Docker, genera el lockfile en cualquier máquina\n' +
      '    Linux con: npm install --package-lock-only',
  );
  process.exit(1);
}

const tipo = String(disponible.stdout).trim();
if (tipo !== 'linux') {
  console.error(
    `Docker está en modo "${tipo}". Cámbialo a contenedores Linux: el lockfile\n` +
      'tiene que generarse en el mismo sistema en el que se instala en producción.',
  );
  process.exit(1);
}

// El trabajo se hace en una carpeta aparte dentro del contenedor para que npm
// no mire el node_modules de Windows, que le haría resolver otra cosa. Se
// copia también el lockfile actual: sin él, cada regeneración subiría de
// versión todo lo que tenga un rango abierto.
const guion = [
  'mkdir -p /tmp/lock',
  'cp /paquete/package.json /tmp/lock/',
  '[ -f /paquete/package-lock.json ] && cp /paquete/package-lock.json /tmp/lock/ || true',
  'cd /tmp/lock',
  'echo "== resolviendo el árbol =="',
  'npm install --package-lock-only --loglevel=error',
  ...(subir.length > 0
    ? [
        `echo "== subiendo ${subir.join(' ')} =="`,
        `npm update ${subir.join(' ')} --package-lock-only --loglevel=error`,
      ]
    : []),
  'echo "== comprobando que npm ci lo acepta =="',
  'npm ci --loglevel=error >/dev/null',
  'cp /tmp/lock/package-lock.json /paquete/package-lock.json',
].join(' && ');

console.log(`Regenerando el lockfile de ${basename(paquete)} en ${IMAGEN}...`);

const resultado = docker([
  'run',
  '--rm',
  '-v',
  `${paquete}:/paquete`,
  IMAGEN,
  'sh',
  '-c',
  guion,
]);

if (resultado.status !== 0) {
  console.error(
    '\nNo se pudo generar un lockfile válido. El árbol de dependencias tiene\n' +
      'un conflicto que npm no resuelve solo; revisa el error de arriba.',
  );
  process.exit(resultado.status ?? 1);
}

console.log(
  '\nLockfile regenerado y validado con npm ci en Linux. Ya se puede subir.',
);
