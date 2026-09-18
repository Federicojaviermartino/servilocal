import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

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
 */
@Injectable()
export class ThrottlerVisitanteGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const cabeceras = (req?.headers ?? {}) as Record<string, unknown>;
    const declarada = cabeceras[CABECERA_VISITANTE];

    // Node entrega repetidas como array. Se queda la primera; que llegue
    // repetida ya sería anómalo viniendo de Cloudflare.
    const visitante = Array.isArray(declarada) ? declarada[0] : declarada;
    if (typeof visitante === 'string' && visitante.trim()) {
      return visitante.trim();
    }

    // Sin Cloudflare delante se vuelve a lo de siempre. Nunca a un valor que
    // haya llegado sin pasar por el borde: eso sería la puerta de atrás.
    const ip = req?.ip;
    return typeof ip === 'string' && ip ? ip : DESCONOCIDO;
  }
}
