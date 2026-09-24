import { normalizar } from '../../services/sinonimos';
import type { Intencion } from '../interpretacion';
import type { Caso } from './casos';

/**
 * Cuánto acierta una forma de interpretar mensajes sobre el conjunto de
 * casos.
 *
 * Se distingue fallar de inventar. Devolver null donde había una categoría es
 * quedarse corto: la búsqueda sale más amplia de lo necesario, pero sale.
 * Devolver una categoría equivocada es peor, porque la búsqueda se estrecha
 * sobre algo que no se ha pedido y el visitante no ve lo que buscaba.
 */
export interface Resultado {
  caso: Caso;
  obtenido: Pick<Intencion, 'categoriaSlug' | 'ciudad'>;
  categoria: 'bien' | 'corto' | 'invento';
  ciudad: 'bien' | 'corto' | 'invento';
}

export interface Informe {
  resultados: Resultado[];
  total: number;
  aciertoCategoria: number;
  aciertoCiudad: number;
  /** Casos en los que las dos cosas salen bien. */
  aciertoCompleto: number;
  inventos: Resultado[];
}

function juzgar(
  esperado: string | null,
  obtenido: string | null,
): 'bien' | 'corto' | 'invento' {
  const igual =
    esperado === null
      ? obtenido === null
      : obtenido !== null && normalizar(obtenido) === normalizar(esperado);
  if (igual) return 'bien';
  return obtenido === null ? 'corto' : 'invento';
}

export async function medir(
  casos: Caso[],
  interpretar: (mensaje: string) => Promise<Intencion> | Intencion,
): Promise<Informe> {
  const resultados: Resultado[] = [];
  for (const caso of casos) {
    const intencion = await interpretar(caso.mensaje);
    resultados.push({
      caso,
      obtenido: {
        categoriaSlug: intencion.categoriaSlug,
        ciudad: intencion.ciudad,
      },
      categoria: juzgar(caso.categoria, intencion.categoriaSlug),
      ciudad: juzgar(caso.ciudad, intencion.ciudad),
    });
  }

  const proporcion = (f: (r: Resultado) => boolean) =>
    resultados.length ? resultados.filter(f).length / resultados.length : 0;

  return {
    resultados,
    total: resultados.length,
    aciertoCategoria: proporcion((r) => r.categoria === 'bien'),
    aciertoCiudad: proporcion((r) => r.ciudad === 'bien'),
    aciertoCompleto: proporcion(
      (r) => r.categoria === 'bien' && r.ciudad === 'bien',
    ),
    inventos: resultados.filter(
      (r) => r.categoria === 'invento' || r.ciudad === 'invento',
    ),
  };
}

const porcentaje = (p: number) => `${Math.round(p * 100)} %`;

/** Resumen legible, para la consola de quien lanza la evaluación. */
export function describir(titulo: string, informe: Informe): string {
  const lineas = [
    `${titulo}: ${informe.total} casos`,
    `  categoría  ${porcentaje(informe.aciertoCategoria)}`,
    `  ciudad     ${porcentaje(informe.aciertoCiudad)}`,
    `  las dos    ${porcentaje(informe.aciertoCompleto)}`,
    `  inventos   ${informe.inventos.length}`,
  ];
  const fallos = informe.resultados.filter(
    (r) => r.categoria !== 'bien' || r.ciudad !== 'bien',
  );
  if (fallos.length) {
    lineas.push('  fallos:');
    for (const r of fallos) {
      lineas.push(
        `    [${r.caso.idioma}] «${r.caso.mensaje}» → ` +
          `${r.obtenido.categoriaSlug ?? '—'} / ${r.obtenido.ciudad ?? '—'}` +
          ` (esperado ${r.caso.categoria ?? '—'} / ${r.caso.ciudad ?? '—'})`,
      );
    }
  }
  return lineas.join('\n');
}
