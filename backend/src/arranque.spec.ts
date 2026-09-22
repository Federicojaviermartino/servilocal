import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El orden de los imports de main.ts, que aquí no es cosmético.
 *
 * ConfigModule carga el .env cuando Nest arranca sus módulos, y para entonces
 * los ficheros de los controladores ya se importaron. Todo lo que lea
 * process.env al definirse —el límite de intentos de acceso se define así—
 * se queda con su valor por defecto aunque el .env diga otra cosa.
 *
 * No falla: se ignora en silencio. Costó catorce minutos de batería de
 * extremo a extremo fallando entera por accesos rechazados, con el .env
 * diciendo que el límite era cien.
 *
 * Se comprueba sobre el texto del fichero porque el orden de los imports es
 * justamente una propiedad del texto: en cuanto se ejecuta, ya es tarde.
 */
describe('Arranque', () => {
  const main = readFileSync(join(__dirname, 'main.ts'), 'utf8');

  it('carga el .env antes que ningún módulo propio', () => {
    const imports = [...main.matchAll(/^import .*?from '(.+?)';|^import '(.+?)';/gm)]
      .map((coincidencia) => coincidencia[1] ?? coincidencia[2]);

    expect(imports[0]).toBe('dotenv/config');
  });

  it('y el resto de imports viene después, no antes', () => {
    // Sin esto, la comprobación de arriba pasaría con el import puesto
    // primero pero duplicado más abajo, o con la lista vacía.
    const imports = [...main.matchAll(/^import .*?from '(.+?)';|^import '(.+?)';/gm)]
      .map((coincidencia) => coincidencia[1] ?? coincidencia[2]);

    expect(imports.length).toBeGreaterThan(5);
    expect(imports.indexOf('./app.module')).toBeGreaterThan(0);
  });
});
