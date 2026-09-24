import type { CookieOptions, Request, Response } from 'express';

/**
 * La sesión del navegador vive en una cookie que JavaScript no puede leer.
 *
 * Antes el token se guardaba en localStorage, y cualquier script que llegara a
 * ejecutarse en la página —una dependencia comprometida, un fallo de
 * escapado— podía llevárselo y usarlo desde otra máquina hasta que caducara.
 * Con httpOnly ese script todavía puede hacer peticiones mientras la página
 * esté abierta, pero no puede sacar la credencial de ahí.
 *
 * La cookie es del frontend, no de la API. onrender.com está en la lista de
 * sufijos públicos, así que servilocal-web y servilocal-api son sitios
 * distintos para el navegador: una cookie puesta por la API sería de terceros,
 * y Safari las bloquea. Por eso el navegador habla con la API a través del
 * propio frontend, que la reenvía: la cookie se pone y se lee en su dominio.
 */
export const COOKIE_SESION = 'sesion';

/**
 * Para quién es cada token.
 *
 * El pase del socket se entrega a JavaScript, porque el socket va directo a
 * la API y no lleva la cookie. Si valiera también como sesión, sacarlo de la
 * página daría lo mismo que sacar la cookie. Con audiencias distintas, cada
 * uno solo abre su puerta.
 */
export const AUDIENCIA_API = 'servilocal-api';
export const AUDIENCIA_SOCKET = 'servilocal-socket';

/** Lo justo para que el socket se identifique; se pide en cada conexión. */
export const DURACION_PASE_SOCKET = '60s';

function opciones(respuesta: Response): CookieOptions {
  return {
    httpOnly: true,
    // Lax y no Strict: con Strict, quien llega desde un enlace en un correo
    // aparecería sin sesión en la primera página. Lax ya impide que otro
    // sitio mande la cookie en un POST, que es lo que importa.
    sameSite: 'lax',
    // Segura si la petición llegó por https, que en producción es siempre:
    // Render lo dice en X-Forwarded-Proto y trust proxy lo lee. Se decide
    // por la petición y no por NODE_ENV porque Safari guarda una cookie
    // segura recibida por http://localhost pero luego no la manda, y la
    // integración continua corre en producción sobre http. Chrome y Firefox
    // hacen una excepción con localhost; WebKit no.
    secure: respuesta.req?.secure === true,
    path: '/',
  };
}

/** Pone la cookie con la misma caducidad que el token que lleva dentro. */
export function abrirSesion(
  respuesta: Response,
  sesion: { accessToken: string; caduca: Date },
): void {
  respuesta.cookie(COOKIE_SESION, sesion.accessToken, {
    ...opciones(respuesta),
    expires: sesion.caduca,
  });
}

/** Tiene que llevar los mismos atributos con que se puso, o no se borra. */
export function cerrarSesion(respuesta: Response): void {
  respuesta.clearCookie(COOKIE_SESION, opciones(respuesta));
}

/** Para passport-jwt: el token de la cookie, si lo hay. */
export function tokenDeCookie(peticion: Request): string | null {
  const valor = (peticion?.cookies as Record<string, unknown> | undefined)?.[
    COOKIE_SESION
  ];
  return typeof valor === 'string' && valor ? valor : null;
}
