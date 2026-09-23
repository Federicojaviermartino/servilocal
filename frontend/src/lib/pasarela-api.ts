/**
 * El paso del navegador a la API a través del frontend.
 *
 * La sesión vive en una cookie httpOnly, y onrender.com está en la lista de
 * sufijos públicos: para el navegador, servilocal-web y servilocal-api son
 * sitios distintos, y una cookie puesta por la API sería de terceros. Safari
 * las bloquea. Así que el navegador pide todo a /api/... en el propio
 * frontend, y este lo reenvía: la cookie se pone y se lee en su dominio.
 *
 * Next ya sabe reenviar peticiones a otro servidor, pero reenvía las
 * cabeceras tal cual llegan, y eso aquí no funciona: ver NO_PASAN.
 */

/**
 * Cabeceras que no pueden seguir hacia la API.
 *
 * Las de Cloudflare, porque la API también está detrás de Cloudflare, y su
 * borde rechaza con un 403 una petición que ya traiga cf-connecting-ip —así
 * impide que alguien la falsifique—; cdn-loop le haría creer que hay un
 * bucle. Las de reenvío describen el salto anterior, no este. Y las dos
 * propias del proxy, si llegan del navegador, son alguien haciéndose pasar
 * por el frontend.
 */
const NO_PASAN =
  /^(cf-|cdn-loop$|x-forwarded-|forwarded$|x-real-ip$|true-client-ip$|x-proxy-secreto$|x-visitante-ip$)/i;

/** A dónde va, en la API, una petición que llega a /api/... */
export function destinoEnLaApi(
  ruta: string,
  consulta: string,
  urlApi: string,
): URL {
  return new URL(`${ruta}${consulta}`, new URL(urlApi).origin);
}

/**
 * Las cabeceras con que la petición sigue hacia la API.
 *
 * Todas las del navegador menos las de NO_PASAN, y la dirección real de
 * quien pide. Visto desde la API, todo lo que reenvía el frontend sale de la
 * misma dirección, y sin esto el límite de intentos de acceso sería uno solo
 * para todos los visitantes. La API solo la cree si llega con el secreto que
 * comparten los dos servicios; sin secreto no se manda ninguna de las dos.
 */
export function cabecerasHaciaLaApi(
  entrantes: Headers,
  secreto: string | undefined,
): Headers {
  const salientes = new Headers();
  entrantes.forEach((valor, nombre) => {
    if (!NO_PASAN.test(nombre)) salientes.set(nombre, valor);
  });

  // La pone Cloudflare en el borde, y no deja que la mande el cliente. Sin
  // Cloudflare delante —en local— no hay nada fiable que reenviar, y es
  // mejor no mandar nada que mandar algo que el visitante pueda elegir.
  const visitante = entrantes.get('cf-connecting-ip')?.trim();
  if (secreto && visitante) {
    salientes.set('x-proxy-secreto', secreto);
    salientes.set('x-visitante-ip', visitante);
  }

  return salientes;
}
