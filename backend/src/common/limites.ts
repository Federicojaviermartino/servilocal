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
