import { ForbiddenException } from '@nestjs/common';

/** Código estable, para que la interfaz explique el rechazo en su idioma. */
export const CODIGO_DEMOSTRACION = 'demostracion';

interface Cuenta {
  esDemostracion: boolean;
}

/**
 * Las cuentas de demostración viven aparte de las reales.
 *
 * Se publican con su contraseña para que cualquiera pruebe la aplicación
 * entera: reservar, pagar, escribir. Pero una cuenta real que reservaba con
 * «Carlos» o recibía un mensaje de «Laura» quedaba a la vista de cualquiera
 * que entrase con esas cuentas: sus datos, sus reservas y sus
 * conversaciones. Entre cuentas de demostración todo sigue funcionando;
 * entre una de demostración y una real, no.
 */
export function comprobarMismoMundo(una: Cuenta, otra: Cuenta): void {
  if (una.esDemostracion !== otra.esDemostracion) {
    throw new ForbiddenException({
      statusCode: 403,
      codigo: CODIGO_DEMOSTRACION,
      message:
        'Las cuentas de demostración y las reales no pueden reservarse ni escribirse entre sí.',
    });
  }
}
