/**
 * Lo que el frontend necesita de su entorno, comprobado al compilar y al
 * arrancar.
 *
 * La API valida el suyo antes de abrir el puerto. Aquí no miraba nadie: con
 * NEXT_PUBLIC_API_URL sin protocolo se compilaba igual, con el CSP apuntando
 * a localhost, y lo único que fallaba era el socket, sin decir nada. Y una
 * clave secreta de Stripe pegada donde va la publicable habría acabado en el
 * JavaScript que se sirve a cualquiera.
 *
 * Solo se mira la forma de lo que está puesto. Que falte algo no se puede
 * exigir desde aquí: en local y en la integración continua se compila sin
 * varias de ellas, y todas tienen un valor por defecto.
 *
 * Nunca se repite el valor de algo que pueda ser un secreto.
 *
 * Va aparte de next.config.js para poder probarlo, y en CommonJS porque es
 * como Next carga su configuración. La imagen de producción lo copia junto
 * a ella: ver el Dockerfile.
 */

/** Las que tienen que ser una dirección de la API: acaban en /api. */
const DIRECCIONES_DE_LA_API = ['NEXT_PUBLIC_API_URL', 'API_INTERNA'];

function esHttp(valor) {
  try {
    const { protocol } = new URL(valor);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Los problemas del entorno, uno por línea. Vacío si no hay ninguno.
 *
 * @param {Record<string, string | undefined>} entorno
 * @returns {string[]}
 */
function problemasDelEntorno(entorno) {
  const texto = (clave) => {
    const valor = entorno[clave];
    return typeof valor === 'string' && valor.trim() !== ''
      ? valor.trim()
      : undefined;
  };
  const problemas = [];

  for (const clave of DIRECCIONES_DE_LA_API) {
    const valor = texto(clave);
    if (valor === undefined) continue;
    if (!esHttp(valor)) {
      problemas.push(
        `${clave} no es una dirección http o https, y es «${valor}».`,
      );
    } else if (!/\/api\/?$/.test(new URL(valor).pathname)) {
      // El servidor pide a ${valor}/services/..., y el socket sale de
      // quitarle /api: sin él, las dos cosas apuntan a donde no hay nada.
      problemas.push(`${clave} tiene que acabar en /api, y es «${valor}».`);
    }
  }

  const sitio = texto('NEXT_PUBLIC_SITE_URL');
  if (sitio !== undefined) {
    if (!esHttp(sitio)) {
      problemas.push(
        `NEXT_PUBLIC_SITE_URL no es una dirección http o https, y es «${sitio}».`,
      );
    } else if (new URL(sitio).origin !== sitio) {
      // Se le pega detrás /sitemap.xml y cada dirección canónica: con una
      // barra final o una ruta saldrían mal todas.
      problemas.push(
        `NEXT_PUBLIC_SITE_URL tiene que ser solo protocolo y dominio, sin barra final ni ruta, y es «${sitio}».`,
      );
    }
  }

  const stripe = texto('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  if (stripe !== undefined) {
    if (/^(sk|rk)_/.test(stripe)) {
      problemas.push(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY es una clave secreta de Stripe: se incrustaría en el JavaScript que recibe cualquier visitante. Aquí va la publicable, la que empieza por pk_. Y esa clave hay que darla por expuesta: cámbiala en Stripe.',
      );
    } else if (!/^pk_/.test(stripe)) {
      problemas.push(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY no parece una clave publicable de Stripe: empiezan por pk_.',
      );
    }
  }

  return problemas;
}

/**
 * Para next.config.js: si algo está mal, no se compila ni se arranca.
 *
 * @param {Record<string, string | undefined>} [entorno]
 */
function validarEntorno(entorno = process.env) {
  const problemas = problemasDelEntorno(entorno);
  if (problemas.length > 0) {
    throw new Error(
      `El entorno del frontend no es válido:\n- ${problemas.join('\n- ')}`,
    );
  }
}

module.exports = { problemasDelEntorno, validarEntorno };
