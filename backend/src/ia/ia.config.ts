import { registerAs } from '@nestjs/config';

/**
 * Tarifas en céntimos de euro por millón de tokens.
 *
 * Se guardan aquí y no se estiman: el coste real se calcula con los tokens que
 * devuelve el proveedor en cada respuesta. Un precio inventado convierte el
 * tope de gasto en decoración.
 */
export const TARIFAS: Readonly<
  Record<string, { entrada: number; salida: number }>
> = Object.freeze({
  'claude-haiku-4-5-20251001': { entrada: 92, salida: 460 },
  'claude-sonnet-5': { entrada: 276, salida: 1380 },
  'claude-opus-5': { entrada: 460, salida: 2300 },
});

/** Tarifa a aplicar cuando el modelo configurado no está en la tabla. */
export const TARIFA_POR_DEFECTO = { entrada: 460, salida: 2300 };

export default registerAs('ia', () => ({
  // Sin clave la capa entera queda inactiva. Nunca se lanza desde aquí: la
  // aplicación tiene que arrancar igual, al contrario de lo que hace
  // PaymentsService con getOrThrow.
  apiKey: process.env.ANTHROPIC_API_KEY ?? null,

  // Interruptor independiente de la clave, para poder desplegar con la
  // funcionalidad apagada y encenderla después de mirar el consumo.
  activa: process.env.IA_ACTIVA !== 'false',

  modelo: process.env.IA_MODELO ?? 'claude-haiku-4-5-20251001',

  // Tope mensual duro. Se comprueba antes de cada llamada y se incrementa
  // después con el coste real. Un euro es deliberadamente poco: la demo es
  // pública y la factura la paga una persona.
  topeMensualCentimos: Number(process.env.IA_TOPE_MENSUAL_CENTIMOS ?? 100),

  // Por debajo del corte de la petición del navegador, que aborta a los 25 s,
  // para que la degradación la decida el servidor y no el cliente.
  tiempoEsperaMs: Number(process.env.IA_TIEMPO_ESPERA_MS ?? 12000),

  // Holgado a propósito: estrangularlo trunca la salida estructurada y deja la
  // funcionalidad permanentemente degradada aparentando que funciona.
  maxTokensSalida: Number(process.env.IA_MAX_TOKENS_SALIDA ?? 2000),
}));

export interface ConfiguracionIa {
  apiKey: string | null;
  activa: boolean;
  modelo: string;
  topeMensualCentimos: number;
  tiempoEsperaMs: number;
  maxTokensSalida: number;
}
