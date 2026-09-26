import type { AxiosError } from 'axios';

/**
 * El código estable que la API manda junto a algunos rechazos.
 *
 * El mensaje de la API está en castellano, sea cual sea el idioma de quien
 * mira. Con el código, la interfaz elige su propio texto traducido.
 */
export function codigoDeError(error: unknown): string | undefined {
  return (error as AxiosError<{ codigo?: string }> | undefined)?.response?.data
    ?.codigo;
}

/** Una cuenta de demostración y una real no se reservan ni se escriben. */
export const CODIGO_DEMOSTRACION = 'demostracion';
