/**
 * Si la semilla puede vaciar la base a la que apunta.
 *
 * La semilla borra todas las tablas antes de sembrar. Para sembrar
 * producción, el README proponía dejar la URL de Neon en el .env, y con ella
 * ahí, el siguiente «npm run seed» en local vaciaba la demo entera: cuentas,
 * reservas, pagos y mensajes. Ahora solo siembra sin preguntar en una base
 * local o de la integración continua. En cualquier otra hay que confirmarlo
 * con SEMILLA_CONFIRMAR y el nombre de la base, que obliga a saber a cuál se
 * está apuntando.
 */
export interface Destino {
  host: string;
  baseDeDatos: string;
}

const HOSTS_LOCALES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
]);

/**
 * Local es la propia máquina o un nombre sin puntos, que es como se llaman
 * los servicios de Docker y de la integración continua («db», «postgres»).
 * Una base en internet siempre tiene un nombre con puntos.
 */
export const esLocal = (host: string) =>
  HOSTS_LOCALES.has(host.toLowerCase()) || !host.includes('.');

export function destinoDe(entorno: NodeJS.ProcessEnv): Destino {
  if (entorno.DATABASE_URL) {
    const url = new URL(entorno.DATABASE_URL);
    return {
      host: url.hostname,
      baseDeDatos: decodeURIComponent(url.pathname.replace(/^\//, '')),
    };
  }
  return {
    host: entorno.DB_HOST || 'localhost',
    baseDeDatos: entorno.DB_DATABASE || 'servilocal',
  };
}

/** Lanza si la semilla no debe tocar esta base. */
export function comprobarDestino(
  destino: Destino,
  confirmacion: string | undefined,
): void {
  if (esLocal(destino.host)) return;
  if (confirmacion?.trim() === destino.baseDeDatos) return;

  throw new Error(
    `La semilla borra todos los datos, y «${destino.host}» no es una base ` +
      `local. Si de verdad quieres vaciar y sembrar «${destino.baseDeDatos}», ` +
      `repite con SEMILLA_CONFIRMAR=${destino.baseDeDatos}.`,
  );
}
