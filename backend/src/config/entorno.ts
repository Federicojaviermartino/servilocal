/**
 * Lo que la API necesita del entorno, comprobado al arrancar.
 *
 * Cada módulo leía lo suyo y se defendía a su manera: unos fallaban al
 * llegar a ellos, otros caían en silencio a un valor por defecto. Con
 * CORS_ORIGINS mal escrita, la API arrancaba, /api/health daba 200 y todo lo
 * que la web intentaba escribir se rechazaba por origen. Un «TRUE» en una
 * variable que se compara con «true» hacía lo contrario de lo que decía.
 * Aquí se comprueba todo a la vez, antes de abrir el puerto, y se dice qué
 * falla: un despliegue con el entorno mal no llega a sustituir al bueno.
 *
 * Nunca se repite el valor de algo que pueda llevar una credencial.
 */
type Entorno = Record<string, unknown>;

/** Números enteros, si están. */
const ENTEROS = [
  'PORT',
  'DB_PORT',
  'THROTTLE_LIMIT',
  'THROTTLE_AUTH_LIMIT',
  'THROTTLE_RESERVAS_LIMIT',
  'THROTTLE_MENSAJES_LIMIT',
  'IA_MAX_TOKENS_SALIDA',
  'IA_TIEMPO_ESPERA_MS',
  'IA_TOPE_MENSUAL_CENTIMOS',
];

/** Se comparan con «true» o «false» tal cual, así que solo valen esos. */
const INTERRUPTORES = [
  'IA_ACTIVA',
  'DB_SSL_PERMISIVO',
  'RETENCIONES_AUTOMATICAS',
];

/** Direcciones, con los protocolos que admite cada una. */
const DIRECCIONES: Record<string, string[]> = {
  DATABASE_URL: ['postgres:', 'postgresql:'],
  REDIS_URL: ['redis:', 'rediss:'],
  SENTRY_DSN: ['https:', 'http:'],
  FRONTEND_URL: ['https:', 'http:'],
};

/** El secreto de backend/.env.example: sirve en local y en ningún otro sitio. */
const SECRETO_DE_EJEMPLO = 'servilocal_jwt_secret_dev_2026';

/** Por debajo, un secreto de firma se puede adivinar con tiempo. */
const LONGITUD_SECRETO = 32;

function esDireccion(valor: string, protocolos: string[]): boolean {
  try {
    return protocolos.includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

/**
 * Un origen: protocolo, dominio y puerto, sin ruta ni barra final. Con la
 * barra no coincidiría nunca con la cabecera Origin, que no la lleva.
 */
function esOrigen(valor: string): boolean {
  try {
    const url = new URL(valor);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.origin === valor
    );
  } catch {
    return false;
  }
}

export function validarEntorno(
  entorno: Entorno,
  avisar: (mensaje: string) => void = (mensaje) => console.warn(mensaje),
): Entorno {
  const texto = (clave: string): string | undefined => {
    const valor = entorno[clave];
    return typeof valor === 'string' && valor.trim() !== ''
      ? valor.trim()
      : undefined;
  };
  const produccion = texto('NODE_ENV') === 'production';
  const errores: string[] = [];

  for (const clave of ['JWT_SECRET', 'STRIPE_SECRET_KEY']) {
    if (!texto(clave)) errores.push(`Falta ${clave}.`);
  }

  if (produccion) {
    if (!texto('DATABASE_URL') && !texto('DB_HOST')) {
      errores.push(
        'Falta DATABASE_URL (o DB_HOST): sin ella se conectaría a localhost.',
      );
    }
    if (!texto('CORS_ORIGINS') && !texto('FRONTEND_URL')) {
      errores.push(
        'Falta CORS_ORIGINS: sin ella solo se aceptaría http://localhost:3000, y la web no podría escribir nada.',
      );
    }
    const secreto = texto('JWT_SECRET');
    if (secreto === SECRETO_DE_EJEMPLO) {
      errores.push(
        'JWT_SECRET es la del ejemplo, que está publicada: cualquiera podría firmar sesiones.',
      );
    } else if (secreto && secreto.length < LONGITUD_SECRETO) {
      avisar(
        `JWT_SECRET tiene menos de ${LONGITUD_SECRETO} caracteres: conviene cambiarla por una más larga.`,
      );
    }
    if (!texto('PROXY_SECRETO')) {
      avisar(
        'Falta PROXY_SECRETO: el límite de peticiones cuenta como uno solo a todos los visitantes que llegan por la web.',
      );
    }
  }

  for (const clave of ENTEROS) {
    const valor = texto(clave);
    if (valor !== undefined && !/^\d+$/.test(valor)) {
      errores.push(`${clave} tiene que ser un número entero, y es «${valor}».`);
    }
  }

  const muestreo = texto('SENTRY_TRACES_SAMPLE_RATE');
  if (muestreo !== undefined) {
    const numero = Number(muestreo);
    if (!Number.isFinite(numero) || numero < 0 || numero > 1) {
      errores.push(
        `SENTRY_TRACES_SAMPLE_RATE tiene que estar entre 0 y 1, y es «${muestreo}».`,
      );
    }
  }

  for (const clave of INTERRUPTORES) {
    const valor = texto(clave);
    if (valor !== undefined && valor !== 'true' && valor !== 'false') {
      errores.push(`${clave} tiene que ser «true» o «false», y es «${valor}».`);
    }
  }

  for (const [clave, protocolos] of Object.entries(DIRECCIONES)) {
    const valor = texto(clave);
    if (valor !== undefined && !esDireccion(valor, protocolos)) {
      errores.push(
        `${clave} no es una dirección válida (${protocolos.join(' o ')}).`,
      );
    }
  }

  const origenes = texto('CORS_ORIGINS');
  if (origenes !== undefined) {
    const lista = origenes
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    for (const origen of lista) {
      if (!esOrigen(origen)) {
        errores.push(
          `CORS_ORIGINS lleva «${origen}», que no es un origen: protocolo y dominio, sin ruta.`,
        );
      }
    }
  }

  if (errores.length > 0) {
    throw new Error(`El entorno no es válido:\n- ${errores.join('\n- ')}`);
  }
  return entorno;
}
