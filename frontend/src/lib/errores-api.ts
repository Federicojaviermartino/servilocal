import type { AxiosError } from 'axios';
import type { useTranslations } from 'next-intl';

/**
 * El código estable que la API manda junto a algunos rechazos.
 *
 * El mensaje de la API está en castellano, sea cual sea el idioma de quien
 * mira. Con el código, la interfaz elige su propio texto traducido.
 */
export function codigoDeError(error: unknown): string | undefined {
  const respuesta = (error as AxiosError<{ codigo?: string }> | undefined)
    ?.response;
  if (respuesta?.data?.codigo) return respuesta.data.codigo;
  // El limitador de peticiones no pone código: con el 429 basta.
  if (respuesta?.status === 429) return CODIGO_DEMASIADAS_PETICIONES;
  return undefined;
}

/** Demasiadas peticiones seguidas desde el mismo sitio. */
export const CODIGO_DEMASIADAS_PETICIONES = 'demasiadas-peticiones';

/** Una cuenta de demostración y una real no se reservan ni se escriben. */
export const CODIGO_DEMOSTRACION = 'demostracion';

/** Completar una reserva sin nada retenido: el profesional decide. */
export const CODIGO_SIN_PAGO_RETENIDO = 'sin-pago-retenido';

/**
 * El texto de un rechazo en el idioma de quien mira, si trae un código que
 * el catálogo «erroresApi» conoce; si no, la alternativa de la pantalla.
 */
export function textoDeError(
  error: unknown,
  tErrores: ReturnType<typeof useTranslations>,
  alternativa: string,
): string {
  const codigo = codigoDeError(error);
  return codigo && tErrores.has(codigo) ? tErrores(codigo) : alternativa;
}
