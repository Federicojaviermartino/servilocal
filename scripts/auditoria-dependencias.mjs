/**
 * Vigila las vulnerabilidades del árbol de producción.
 *
 * `npm audit` a secas no sirve como verja: o lo rompe todo desde el primer
 * día, o se le baja el umbral hasta que deja de decir nada. Lo que hace falta
 * es que lo ya conocido no moleste y lo nuevo pare la integración.
 *
 * Así que cada aviso aceptado se escribe en auditoria-aceptada.json con dos
 * cosas que obligan a pensar: por qué se acepta y hasta cuándo. Pasada esa
 * fecha vuelve a fallar aunque siga aceptado, que es lo que impide que una
 * excepción temporal se quede para siempre.
 *
 * Solo mira dependencias de producción: una vulnerabilidad en el empaquetador
 * de pruebas no llega a ningún usuario.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROYECTOS = ['backend', 'frontend'];

const ORDEN = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };

/** npm audit sale con código 1 cuando encuentra algo, que no es un error. */
async function auditar(proyecto) {
  const opciones = { cwd: resolve(RAIZ, proyecto), maxBuffer: 32 * 1024 * 1024 };
  try {
    const { stdout } = await ejecutar(
      'npm',
      ['audit', '--omit=dev', '--json'],
      { ...opciones, shell: process.platform === 'win32' },
    );
    return JSON.parse(stdout);
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

/** Un aviso puede llegar por varias rutas; interesa una entrada por aviso. */
function avisosDe(informe) {
  const encontrados = new Map();
  for (const paquete of Object.values(informe.vulnerabilities ?? {})) {
    for (const via of paquete.via ?? []) {
      if (typeof via === 'object' && via.source) {
        encontrados.set(String(via.source), {
          id: String(via.source),
          paquete: via.name,
          severidad: via.severity,
          titulo: via.title,
          url: via.url,
        });
      }
    }
  }
  return [...encontrados.values()].sort(
    (a, b) => ORDEN[a.severidad] - ORDEN[b.severidad],
  );
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

const aceptadas = JSON.parse(
  readFileSync(resolve(RAIZ, 'auditoria-aceptada.json'), 'utf8'),
);

let fallos = 0;

for (const proyecto of PROYECTOS) {
  const avisos = avisosDe(await auditar(proyecto));
  const permitidas = aceptadas[proyecto] ?? {};

  const nuevas = avisos.filter((a) => !permitidas[a.id]);
  const caducadas = avisos.filter(
    (a) => permitidas[a.id] && permitidas[a.id].caduca < hoy(),
  );

  console.log(
    `\n${proyecto}: ${avisos.length} aviso(s) en producción, ` +
      `${avisos.length - nuevas.length} aceptado(s)`,
  );

  for (const aviso of nuevas) {
    console.log(
      `  NUEVO  ${aviso.severidad.padEnd(8)} ${aviso.paquete} — ${aviso.titulo}`,
    );
    console.log(`         ${aviso.url}`);
    fallos += 1;
  }

  for (const aviso of caducadas) {
    console.log(
      `  CADUCÓ ${aviso.severidad.padEnd(8)} ${aviso.paquete} — ` +
        `se aceptó hasta ${permitidas[aviso.id].caduca}`,
    );
    fallos += 1;
  }

  // Una aceptación que ya no corresponde a ningún aviso es ruido que
  // encubre: si el paquete se arregló, la excepción sobra.
  const vivas = new Set(avisos.map((a) => a.id));
  for (const id of Object.keys(permitidas)) {
    if (!vivas.has(id)) {
      console.log(
        `  SOBRA  ${id} (${permitidas[id].paquete}) ya no aparece: ` +
          `quitar de auditoria-aceptada.json`,
      );
      fallos += 1;
    }
  }
}

if (fallos > 0) {
  console.log(
    `\n${fallos} cosa(s) que resolver. Si un aviso nuevo se va a asumir, ` +
      `hay que anotarlo en auditoria-aceptada.json con su motivo y su fecha.`,
  );
  process.exit(1);
}

console.log('\nSin avisos nuevos ni aceptaciones caducadas.');
