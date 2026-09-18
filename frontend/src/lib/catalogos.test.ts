import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';

const CARPETA = join(process.cwd(), 'messages');

function catalogo(idioma: string): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(CARPETA, `${idioma}.json`), 'utf8'));
}

/**
 * Paridad de los diez catálogos.
 *
 * Hasta ahora esto lo comprobaba un script suelto que había que acordarse de
 * ejecutar. Una clave que falte en un idioma no rompe la compilación: deja
 * una etiqueta en blanco o el nombre de la clave en pantalla, y solo se ve
 * navegando en ese idioma concreto.
 */
describe('catálogos de traducción', () => {
  const referencia = catalogo(routing.defaultLocale);
  const idiomas = routing.locales;

  it('hay un archivo por idioma configurado, y ninguno de más', () => {
    const archivos = readdirSync(CARPETA)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .sort();

    expect(archivos).toEqual([...idiomas].sort());
  });

  it.each(idiomas)('%s tiene exactamente las mismas secciones', (idioma) => {
    expect(Object.keys(catalogo(idioma)).sort()).toEqual(
      Object.keys(referencia).sort(),
    );
  });

  it.each(idiomas)('%s tiene exactamente las mismas claves', (idioma) => {
    const otro = catalogo(idioma);

    for (const seccion of Object.keys(referencia)) {
      expect(Object.keys(otro[seccion]).sort()).toEqual(
        Object.keys(referencia[seccion]).sort(),
      );
    }
  });

  it.each(idiomas)('%s no deja ningún texto vacío', (idioma) => {
    const otro = catalogo(idioma);
    const vacias: string[] = [];

    for (const [seccion, claves] of Object.entries(otro)) {
      for (const [clave, valor] of Object.entries(claves)) {
        if (!String(valor).trim()) vacias.push(`${seccion}.${clave}`);
      }
    }

    expect(vacias).toEqual([]);
  });

  it('los marcadores de una frase son los mismos en todos los idiomas', () => {
    // Traducir «{min} a {max}» y dejarse el {max} no rompe nada al compilar:
    // next-intl lanza en tiempo de ejecución, y solo en ese idioma.
    const marcadores = (texto: string) =>
      (texto.match(/\{(\w+)[,}]/g) ?? []).map((m) => m.slice(1, -1)).sort();

    // Primero, que de verdad haya frases con marcadores: si no, esta prueba
    // pasaría comparando listas vacías entre sí.
    const conMarcadores = Object.values(referencia)
      .flatMap((claves) => Object.values(claves))
      .filter((texto) => marcadores(texto).length > 0);
    expect(conMarcadores.length).toBeGreaterThan(10);

    for (const idioma of idiomas) {
      if (idioma === routing.defaultLocale) continue;
      const otro = catalogo(idioma);

      for (const [seccion, claves] of Object.entries(referencia)) {
        for (const [clave, valor] of Object.entries(claves)) {
          expect(
            marcadores(otro[seccion][clave]),
            `${idioma} · ${seccion}.${clave}`,
          ).toEqual(marcadores(valor));
        }
      }
    }
  });
});
