/** Testigo de inyección del proveedor de modelo. */
export const PROVEEDOR_MODELO = Symbol('PROVEEDOR_MODELO');

export interface PeticionModelo {
  /** Reglas e instrucciones. Lo escribe el sistema, nunca un usuario. */
  sistema: string;
  /** Contenido a procesar. Puede venir de un usuario: entra como dato inerte. */
  mensaje: string;
}

export interface RespuestaModelo {
  texto: string;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
}

/**
 * Contrato del proveedor de modelo.
 *
 * Un solo método a propósito. La abstracción de cuatro operaciones que trae
 * logiaccounting-pro (chat, complete, embed, vision) tiene dos de ellas
 * lanzando NotImplementedError o codificando un modelo a mano, que es lo que
 * pasa cuando se declara una interfaz más ancha que los casos de uso reales.
 * Aquí solo hay uno; cuando aparezca otro, se añade.
 */
export interface ProveedorModelo {
  /** Si es falso, la capa entera va por el camino determinista. */
  readonly disponible: boolean;

  /** Nombre del motor, para poder enseñarlo en la respuesta y en el consumo. */
  readonly nombre: string;

  completar(peticion: PeticionModelo): Promise<RespuestaModelo>;
}
