/**
 * Registro, acceso y lo que pide la contraseña: cinco intentos por minuto
 * y visitante. Sin este límite, probar contraseñas contra una cuenta
 * conocida no tiene ningún coste para el atacante.
 *
 * Se puede elevar con THROTTLE_AUTH_LIMIT para entornos de prueba, donde una
 * batería de tests inicia sesión muchas veces seguidas desde la misma IP.
 * En producción debe quedarse en el valor por defecto.
 */
export const LIMITE_AUTENTICACION = {
  default: {
    limit: Number(process.env.THROTTLE_AUTH_LIMIT) || 5,
    ttl: 60000,
  },
};

/**
 * Los límites de las rutas que crean algo en nombre de alguien.
 *
 * El general, 120 por minuto y visitante, deja crear una reserva cada medio
 * segundo: bastaba para llenar de solicitudes falsas la bandeja de un
 * profesional, o de mensajes la de cualquiera, y a cada una le seguía un
 * aviso. Estas rutas lo endurecen.
 *
 * Se pueden elevar para las baterías de pruebas, que crean muchas seguidas
 * desde la misma dirección. En producción deben quedarse en su valor.
 */
/**
 * Publicar servicios: veinte por hora y visitante. Con las cuentas de
 * demostración a mano de cualquiera, el catálogo se podía llenar de
 * anuncios falsos a ritmo de uno por segundo.
 */
export const LIMITE_SERVICIOS = {
  default: {
    limit: Number(process.env.THROTTLE_SERVICIOS_LIMIT) || 20,
    ttl: 60 * 60 * 1000,
  },
};

export const LIMITE_RESERVAS = {
  default: {
    limit: Number(process.env.THROTTLE_RESERVAS_LIMIT) || 10,
    ttl: 60000,
  },
};

export const LIMITE_MENSAJES = {
  default: {
    limit: Number(process.env.THROTTLE_MENSAJES_LIMIT) || 30,
    ttl: 60000,
  },
};
