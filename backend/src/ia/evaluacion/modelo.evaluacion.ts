import { ErrorIa } from '../errores';
import { TARIFAS, TARIFA_POR_DEFECTO } from '../ia.config';
import {
  Intencion,
  extraerJson,
  interpretarSinModelo,
  promptDeSistema,
  validarIntencion,
} from '../interpretacion';
import { ProveedorAnthropic } from '../proveedores/proveedor-anthropic';
import { CASOS, CATALOGO_SEMILLA } from './casos';
import { describir, medir } from './medir';

/**
 * El asistente con el modelo de verdad, contra el conjunto de evaluación.
 *
 * No corre en la integración: cada caso es una llamada de pago. Se lanza a
 * mano con `npm run evaluar:ia` y una ANTHROPIC_API_KEY en el entorno, o
 * desde la pestaña de Actions con la clave como secreto. Pasa por las mismas
 * funciones que producción —el mismo prompt, la misma validación contra el
 * catálogo—, así que lo que mide es lo que vería un visitante.
 *
 * Una pasada son 48 llamadas cortas: con Haiku, unos pocos céntimos. Se
 * imprime lo que costó al terminar.
 *
 * Los umbrales son el punto de partida, no una medida: se ajustan con la
 * primera pasada real, y a partir de ahí sirven para ver si un cambio de
 * prompt o de modelo empeora algo.
 */
const CLAVE = process.env.ANTHROPIC_API_KEY;
const MODELO = process.env.IA_MODELO ?? 'claude-haiku-4-5-20251001';

const UMBRAL_CATEGORIA = 0.9;
const UMBRAL_CIUDAD = 0.9;
/** Inventar es peor que quedarse corto: aquí se tolera muy poco. */
const MAXIMO_INVENTOS = 1;

describe.skipIf(!CLAVE)(`el asistente con ${MODELO}`, () => {
  it('interpreta el conjunto de evaluación', async () => {
    const proveedor = new ProveedorAnthropic({
      apiKey: CLAVE!,
      activa: true,
      modelo: MODELO,
      topeMensualCentimos: 0,
      tiempoEsperaMs: 30_000,
      maxTokensSalida: 300,
    });
    const sistema = promptDeSistema(CATALOGO_SEMILLA);

    let tokensEntrada = 0;
    let tokensSalida = 0;
    let milisegundos = 0;
    const fallidas: string[] = [];

    const informe = await medir(CASOS, async (mensaje): Promise<Intencion> => {
      const inicio = Date.now();
      try {
        const respuesta = await proveedor.completar({ sistema, mensaje });
        tokensEntrada += respuesta.tokensEntrada;
        tokensSalida += respuesta.tokensSalida;
        return validarIntencion(extraerJson(respuesta.texto), CATALOGO_SEMILLA);
      } catch (error) {
        // En producción, un fallo del modelo cae al diccionario. Aquí se
        // cuenta aparte: lo que se mide es el modelo, no el respaldo.
        fallidas.push(
          `«${mensaje}»: ${error instanceof ErrorIa ? error.causa : 'desconocida'}`,
        );
        return { categoriaSlug: null, ciudad: null, palabrasClave: [] };
      } finally {
        milisegundos += Date.now() - inicio;
      }
    });

    const tarifa = TARIFAS[MODELO] ?? TARIFA_POR_DEFECTO;
    const centimos =
      (tokensEntrada * tarifa.entrada + tokensSalida * tarifa.salida) / 1e6;
    const diccionario = await medir(CASOS, (mensaje) =>
      interpretarSinModelo(mensaje, CATALOGO_SEMILLA),
    );

    console.log(
      [
        describir(`Modelo ${MODELO}`, informe),
        '',
        describir('Diccionario, para comparar', diccionario),
        '',
        `Coste: ${centimos.toFixed(2)} céntimos · ` +
          `${tokensEntrada} tokens de entrada y ${tokensSalida} de salida · ` +
          `${Math.round(milisegundos / CASOS.length)} ms por caso`,
        ...(fallidas.length
          ? ['Llamadas fallidas:', ...fallidas.map((f) => `  ${f}`)]
          : []),
      ].join('\n'),
    );

    expect(fallidas).toEqual([]);
    expect(informe.aciertoCategoria).toBeGreaterThanOrEqual(UMBRAL_CATEGORIA);
    expect(informe.aciertoCiudad).toBeGreaterThanOrEqual(UMBRAL_CIUDAD);
    expect(informe.inventos.length).toBeLessThanOrEqual(MAXIMO_INVENTOS);
  }, 600_000);
});
