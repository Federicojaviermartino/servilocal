import { isIPv6 } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { visitanteReenviado } from '../proxy-frontend';

/**
 * Cabecera que pone Cloudflare con la dirección de quien conecta de verdad.
 *
 * Se eligió tras medirlo contra el despliegue, no por lo que diga la
 * documentación, que no dice nada: mandándola desde fuera, Cloudflare
 * responde 403 en el borde y la petición no llega al contenedor. No es que
 * falsificarla sea difícil, es que no se puede.
 */
const CABECERA_VISITANTE = 'cf-connecting-ip';

/** Cuando no hay nada fiable. Comparte cubo, que es el lado seguro. */
const DESCONOCIDO = 'desconocido';

/** Una IPv4 escrita como IPv6: ::ffff:192.0.2.1. */
const IPV4_EN_IPV6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * La clave de una dirección: las IPv6, por su /64.
 *
 * Un proveedor no da a cada conexión una IPv6, sino un bloque /64 entero, y
 * cambiar de dirección dentro de él es gratis: contadas una a una, bastaba
 * con rotarlas para no gastar nunca el límite. Las IPv4, también las
 * escritas como IPv6, se quedan como están.
 */
export function agruparVisitante(ip: string): string {
  const mapeada = IPV4_EN_IPV6.exec(ip);
  if (mapeada) return mapeada[1];
  if (!isIPv6(ip)) return ip;

  // Lo que va tras «%» es la interfaz de red, no parte de la dirección.
  const [direccion] = ip.split('%');
  const [antes, despues] = direccion.split('::');
  const bloques = (texto?: string) => (texto ? texto.split(':') : []);
  const izquierda = bloques(antes);
  // Una IPv4 al final ocupa dos bloques.
  const derecha = bloques(despues).flatMap((b) =>
    b.includes('.') ? ['0', '0'] : [b],
  );
  const huecos =
    despues === undefined ? 0 : 8 - izquierda.length - derecha.length;
  const completa = [
    ...izquierda,
    ...Array<string>(huecos).fill('0'),
    ...derecha,
  ];

  const prefijo = completa.slice(0, 4).map((b) => parseInt(b, 16).toString(16));
  return `${prefijo.join(':')}::/64`;
}

/**
 * Limitador por visitante real, no por balanceador.
 *
 * `req.ip` no vale aquí. Con `trust proxy: 1` Express toma la última entrada
 * de X-Forwarded-For, que en Render es un balanceador interno y **cambia
 * entre peticiones**: medido, un mismo cliente caía en dos contadores. El
 * efecto no era limitar de menos sino dejar de limitar por persona, porque
 * todos los que entran por el mismo balanceador comparten cuenta y quien
 * abusa consume la cuota de los demás.
 *
 * Tampoco vale leer X-Forwarded-For directamente. Cloudflare **concatena** lo
 * que mande el cliente en vez de sanearlo: `X-Forwarded-For: 1.2.3.4` llega
 * como `1.2.3.4, <IP real>, ...`, así que la primera posición es mentira del
 * propio cliente. Un limitador que se esquiva mandando una cabecera es peor
 * que no tener ninguno, porque además se cree protegido.
 *
 * Se descartó subir `trust proxy` a 3, que también funciona hoy porque la IP
 * real queda siempre tercera desde la derecha. Depende de que sigan siendo
 * exactamente dos saltos de infraestructura, y eso no está documentado en
 * ninguna parte: sería correcto por casualidad medida, no por contrato.
 *
 * Lo que llega del navegador pasa antes por el frontend, y ahí Cloudflare ve
 * como visitante al servidor del frontend, el mismo para todos. Para esas
 * peticiones cuenta la dirección que reenvía el frontend, pero solo si viene
 * con el secreto compartido: ver proxy-frontend.ts.
 */
@Injectable()
export class ThrottlerVisitanteGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const cabeceras = (req?.headers ?? {}) as Record<string, unknown>;

    const reenviado = visitanteReenviado(cabeceras);
    if (reenviado) return agruparVisitante(reenviado);

    const declarada = cabeceras[CABECERA_VISITANTE];

    // Node entrega repetidas como array. Se queda la primera; que llegue
    // repetida ya sería anómalo viniendo de Cloudflare.
    const visitante = Array.isArray(declarada) ? declarada[0] : declarada;
    if (typeof visitante === 'string' && visitante.trim()) {
      return agruparVisitante(visitante.trim());
    }

    // Sin Cloudflare delante se vuelve a lo de siempre. Nunca a un valor que
    // haya llegado sin pasar por el borde: eso sería la puerta de atrás.
    const ip = req?.ip;
    return typeof ip === 'string' && ip ? agruparVisitante(ip) : DESCONOCIDO;
  }
}
