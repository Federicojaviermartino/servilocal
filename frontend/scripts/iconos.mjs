// Los iconos del sitio, sacados del pin de la cabecera.
//
// No había ninguno: la pestaña enseñaba el icono genérico del navegador, y
// cada página dejaba en la consola un 404 de /favicon.ico, que los
// navegadores piden siempre por su cuenta. Lighthouse lo contaba como error
// en todas las páginas.
//
//   node scripts/iconos.mjs
//
// Escribe en src/app, donde Next los sirve y los enlaza solo:
//   icon.svg        el de los navegadores actuales, nítido a cualquier tamaño
//   favicon.ico     16, 32 y 48 px, para lo que pida /favicon.ico
//   apple-icon.png  180 px, para la pantalla de inicio del móvil
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../src/app');

// El MapPin de lucide, en blanco sobre el azul de la marca (primary-800).
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#1e40af"/>
  <g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
    <circle cx="12" cy="10" r="3"/>
  </g>
</svg>
`;

const png = (lado) =>
  sharp(Buffer.from(SVG), { density: 72 * (lado / 32) * 2 })
    .resize(lado, lado)
    .png({ compressionLevel: 9 })
    .toBuffer();

/**
 * Un .ico con PNG dentro, que es lo que admiten todos los navegadores desde
 * hace años: una cabecera, una entrada por tamaño y los PNG detrás.
 */
function ico(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(imagenes.length, 4);

  let desplazamiento = 6 + 16 * imagenes.length;
  const entradas = imagenes.map(({ lado, datos }) => {
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(lado >= 256 ? 0 : lado, 0);
    entrada.writeUInt8(lado >= 256 ? 0 : lado, 1);
    entrada.writeUInt16LE(1, 4);
    entrada.writeUInt16LE(32, 6);
    entrada.writeUInt32LE(datos.length, 8);
    entrada.writeUInt32LE(desplazamiento, 12);
    desplazamiento += datos.length;
    return entrada;
  });

  return Buffer.concat([
    cabecera,
    ...entradas,
    ...imagenes.map((i) => i.datos),
  ]);
}

writeFileSync(join(APP, 'icon.svg'), SVG);

const tamanos = [16, 32, 48];
const imagenes = await Promise.all(
  tamanos.map(async (lado) => ({ lado, datos: await png(lado) })),
);
writeFileSync(join(APP, 'favicon.ico'), ico(imagenes));

writeFileSync(join(APP, 'apple-icon.png'), await png(180));

console.log('icon.svg, favicon.ico y apple-icon.png escritos en src/app');
