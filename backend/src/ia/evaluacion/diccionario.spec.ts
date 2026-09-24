import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { interpretarSinModelo } from '../interpretacion';
import { CASOS, CATALOGO_SEMILLA } from './casos';
import { describir, medir } from './medir';

/**
 * El diccionario de oficios contra el conjunto de evaluación.
 *
 * Es el camino que se recorre sin clave, sin presupuesto o cuando el modelo
 * falla, así que es el que más visitantes ven y el único que se puede probar
 * gratis en cada cambio. La evaluación con el modelo, que cuesta dinero, se
 * lanza aparte: ver modelo.evaluacion.ts.
 */
const interpretar = (mensaje: string) =>
  interpretarSinModelo(mensaje, CATALOGO_SEMILLA);

/**
 * Lo que el diccionario confunde hoy, sabido y escrito. Una negación no la
 * entiende: ve «fontanero» y se queda con él. Si aparece otra confusión, la
 * prueba falla: puede ser un sinónimo nuevo que pisa a otro.
 */
const CONFUSIONES_CONOCIDAS = [
  'No quiero un fontanero, lo que busco es un pintor en Sevilla',
];

describe('el diccionario de oficios', () => {
  it('resuelve todos los casos que le tocan', async () => {
    const suyos = CASOS.filter((c) => c.ambito === 'diccionario');
    const informe = await medir(suyos, interpretar);

    expect(informe.aciertoCompleto, describir('Diccionario', informe)).toBe(1);
  });

  it('no se inventa nada más que lo que ya se sabe', async () => {
    // Quedarse corto es aceptable: la búsqueda sale más amplia. Inventar
    // no: estrecha la búsqueda sobre algo que no se ha pedido.
    const informe = await medir(CASOS, interpretar);

    expect(informe.inventos.map((r) => r.caso.mensaje)).toEqual(
      CONFUSIONES_CONOCIDAS,
    );
  });

  it('nunca devuelve una categoría o una ciudad fuera del catálogo', async () => {
    const informe = await medir(CASOS, interpretar);
    const slugs = new Set(CATALOGO_SEMILLA.categorias.map((c) => c.slug));
    const ciudades = new Set(CATALOGO_SEMILLA.ciudades);

    for (const { obtenido } of informe.resultados) {
      if (obtenido.categoriaSlug) {
        expect(slugs.has(obtenido.categoriaSlug)).toBe(true);
      }
      if (obtenido.ciudad) expect(ciudades.has(obtenido.ciudad)).toBe(true);
    }
  });
});

describe('el conjunto de evaluación', () => {
  it('usa el mismo catálogo que la semilla', () => {
    // Se copia para no depender de una base levantada. Si la semilla gana
    // una categoría o una ciudad y esto no, la evaluación mediría contra un
    // catálogo que ya no es el de producción.
    const semilla = readFileSync(
      resolve(__dirname, '../../database/seeds/run-seed.ts'),
      'utf8',
    );
    const slugs = [...semilla.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);
    const ciudades = [
      ...new Set([...semilla.matchAll(/city: '([^']+)'/g)].map((m) => m[1])),
    ];

    expect(CATALOGO_SEMILLA.categorias.map((c) => c.slug).sort()).toEqual(
      slugs.sort(),
    );
    expect([...CATALOGO_SEMILLA.ciudades].sort()).toEqual(ciudades.sort());
  });

  it('cubre los diez idiomas de la interfaz', () => {
    const idiomas = new Set(CASOS.map((c) => c.idioma));

    expect(idiomas.size).toBe(10);
  });

  it('cada caso espera algo del catálogo, o nada', () => {
    const slugs = new Set(CATALOGO_SEMILLA.categorias.map((c) => c.slug));
    const ciudades = new Set(CATALOGO_SEMILLA.ciudades);

    for (const caso of CASOS) {
      if (caso.categoria) expect(slugs.has(caso.categoria)).toBe(true);
      if (caso.ciudad) expect(ciudades.has(caso.ciudad)).toBe(true);
    }
  });
});
