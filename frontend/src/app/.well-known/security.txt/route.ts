import { SITIO_URL } from '@/lib/sitio';

/** Dónde está escrito cómo avisar y qué se hace con el aviso. */
const POLITICA =
  'https://github.com/Federicojaviermartino/servilocal/blob/main/SECURITY.md';

/** Lo que vale este fichero desde que se pide. */
const DIAS_DE_VALIDEZ = 180;

/**
 * A quién avisar de un fallo de seguridad, donde lo buscan las herramientas
 * y la gente que los encuentra (RFC 9116).
 *
 * SECURITY.md ya lo decía, pero hay que saber que este sitio tiene un
 * repositorio y dar con él. Aquí se apunta a ese mismo documento, que es el
 * único sitio donde está escrito el contacto.
 *
 * La caducidad se calcula al pedirlo: el formato la exige, para que nadie se
 * fíe de un contacto abandonado, y un fichero con la fecha fija caducaría
 * solo a los seis meses de no desplegar.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const caduca = new Date(Date.now() + DIAS_DE_VALIDEZ * 24 * 60 * 60 * 1000);
  const lineas = [
    `Contact: ${POLITICA}`,
    `Expires: ${caduca.toISOString()}`,
    'Preferred-Languages: es, en',
    `Canonical: ${SITIO_URL}/.well-known/security.txt`,
    `Policy: ${POLITICA}`,
  ];

  return new Response(`${lineas.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
