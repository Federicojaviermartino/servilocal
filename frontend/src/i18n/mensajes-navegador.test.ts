import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';
import { mensajesDelNavegador, SOLO_SERVIDOR } from './mensajes-navegador';

/** Todos los ficheros de código, para ver qué espacios usa cada uno. */
function ficheros(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.tsx?$/.test(nombre) && !/\.(test|stories)\./.test(nombre)
      ? [ruta]
      : [];
  });
}

describe('El catálogo del navegador', () => {
  it('no lleva lo que solo se pinta en el servidor', () => {
    const delNavegador = mensajesDelNavegador(es);

    for (const espacio of SOLO_SERVIDOR) {
      expect(delNavegador).not.toHaveProperty(espacio);
    }
    expect(delNavegador).toHaveProperty('comun');
  });

  it('ningún componente de cliente usa un espacio que no le llega', () => {
    // Si alguno lo usara, en el navegador faltaría el mensaje.
    const usados = ficheros(join(__dirname, '..'))
      .map((ruta) => readFileSync(ruta, 'utf-8'))
      .filter((codigo) =>
        /^['"]use client['"]/m.test(codigo.split('\n').slice(0, 15).join('\n')),
      )
      .flatMap((codigo) =>
        Array.from(
          codigo.matchAll(/useTranslations\(\s*'([^']+)'/g),
          ([, espacio]) => espacio,
        ),
      );

    for (const espacio of SOLO_SERVIDOR) {
      expect(usados).not.toContain(espacio);
    }
  });
});
