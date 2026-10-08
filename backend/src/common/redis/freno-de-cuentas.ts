import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from './redis.service';

/** Una cuenta que ha agotado sus intentos y tiene que esperar. */
export const CODIGO_CUENTA_FRENADA = 'cuenta-frenada';

/**
 * Cuántas contraseñas equivocadas seguidas admite una cuenta, y en cuánto
 * tiempo.
 *
 * El límite por visitante, cinco por minuto, no protege una cuenta: quien
 * reparte los intentos entre muchas direcciones no se encuentra con él
 * nunca. Con este, a una cuenta concreta se le pueden probar diez
 * contraseñas cada cuarto de hora, vengan de donde vengan.
 *
 * Se puede elevar con THROTTLE_CUENTA_LIMIT para las baterías de pruebas. En
 * producción debe quedarse en su valor.
 */
export const FRENO_DE_CUENTA = {
  maximo: Number(process.env.THROTTLE_CUENTA_LIMIT) || 10,
  ventanaMs: 15 * 60 * 1000,
};

/** En memoria no se guardan más cuentas que estas: ver `enMemoria`. */
const TOPE_EN_MEMORIA = 5000;

interface Cuenta {
  fallos: number;
  /** Cuándo se olvidan, en milisegundos de reloj. */
  hasta: number;
}

/**
 * El freno de intentos por cuenta.
 *
 * Cuenta las contraseñas equivocadas de cada correo, exista o no la cuenta:
 * si solo frenara las que existen, el propio freno diría qué correos están
 * registrados, que es lo que el acceso se cuida de no decir. Y con el freno
 * echado no se llega a comparar la contraseña: si la buena pasara, no
 * frenaría a nadie.
 *
 * Tiene un precio, y es que cualquiera puede dejar a alguien un cuarto de
 * hora sin entrar a base de fallar con su correo. Por eso la ventana es
 * corta, y por eso quien llama deja fuera a las cuentas de demostración: su
 * contraseña está en la página de acceso, y frenarlas sería dejar a todos
 * sin demostración.
 *
 * En Redis si lo hay, para que lo compartan todas las instancias y no se
 * pierda al desplegar; si no lo hay o no contesta, en la memoria del
 * proceso. Del correo solo se guarda la huella.
 */
@Injectable()
export class FrenoDeCuentas {
  private readonly logger = new Logger(FrenoDeCuentas.name);
  private readonly enMemoria = new Map<string, Cuenta>();
  private avisado = false;

  constructor(private readonly redis: RedisService) {}

  /** Rechaza con un 429, y cuánto falta, si la cuenta ya no admite más. */
  async comprobar(correo: string): Promise<void> {
    const cuenta = await this.leer(claveDe(correo));
    if (!cuenta || cuenta.fallos < FRENO_DE_CUENTA.maximo) return;

    const segundos = Math.max(1, Math.ceil((cuenta.hasta - Date.now()) / 1000));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        codigo: CODIGO_CUENTA_FRENADA,
        message:
          'Demasiados intentos fallidos con esta cuenta: espera unos minutos.',
        // El filtro de excepciones lo pone también en Retry-After.
        reintentarEn: segundos,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Una contraseña equivocada más. */
  async anotarFallo(correo: string): Promise<void> {
    const clave = claveDe(correo);
    const fallos = await this.sumar(clave);
    if (fallos === FRENO_DE_CUENTA.maximo) {
      // Sin el correo: basta para ver en el registro que está pasando.
      this.logger.warn(
        `Una cuenta se frena tras ${fallos} contraseñas equivocadas ` +
          `(${clave.slice(-12)}).`,
      );
    }
  }

  /** Al entrar o al restablecer la contraseña se empieza de cero. */
  async olvidar(correo: string): Promise<void> {
    const clave = claveDe(correo);
    this.enMemoria.delete(clave);
    try {
      await this.redis.cliente?.del(clave);
    } catch (error) {
      this.avisar(error);
    }
  }

  private async leer(clave: string): Promise<Cuenta | null> {
    const cliente = this.redis.cliente;
    if (cliente) {
      try {
        const [fallos, queda] = await Promise.all([
          cliente.get(clave),
          cliente.pttl(clave),
        ]);
        if (!fallos) return null;
        return {
          fallos: Number(fallos),
          hasta: Date.now() + (queda > 0 ? queda : FRENO_DE_CUENTA.ventanaMs),
        };
      } catch (error) {
        this.avisar(error);
      }
    }
    const cuenta = this.enMemoria.get(clave);
    if (cuenta && cuenta.hasta <= Date.now()) {
      this.enMemoria.delete(clave);
      return null;
    }
    return cuenta ?? null;
  }

  private async sumar(clave: string): Promise<number> {
    const cliente = this.redis.cliente;
    if (cliente) {
      try {
        const fallos = await cliente.incr(clave);
        // La ventana empieza con el primer fallo y no se alarga con los
        // siguientes. Se mira también después: una clave que se quedara sin
        // caducidad frenaría esa cuenta para siempre.
        if (fallos === 1 || (await cliente.pttl(clave)) < 0) {
          await cliente.pexpire(clave, FRENO_DE_CUENTA.ventanaMs);
        }
        return fallos;
      } catch (error) {
        this.avisar(error);
      }
    }
    return this.sumarEnMemoria(clave);
  }

  private sumarEnMemoria(clave: string): number {
    const ahora = Date.now();
    const anterior = this.enMemoria.get(clave);
    const cuenta =
      anterior && anterior.hasta > ahora
        ? { ...anterior, fallos: anterior.fallos + 1 }
        : { fallos: 1, hasta: ahora + FRENO_DE_CUENTA.ventanaMs };
    this.enMemoria.set(clave, cuenta);

    // Cada correo distinto que alguien pruebe ocupa una entrada: sin tope,
    // probar correos al azar llenaría la memoria. Se van primero las
    // caducadas y, si no basta, las más antiguas.
    if (this.enMemoria.size > TOPE_EN_MEMORIA) {
      for (const [otra, { hasta }] of this.enMemoria) {
        if (hasta <= ahora) this.enMemoria.delete(otra);
      }
      for (const otra of this.enMemoria.keys()) {
        if (this.enMemoria.size <= TOPE_EN_MEMORIA) break;
        this.enMemoria.delete(otra);
      }
    }
    return cuenta.fallos;
  }

  /** Una vez por caída, como la caché: Redis caído no es noticia cada vez. */
  private avisar(error: unknown): void {
    if (this.avisado) return;
    this.avisado = true;
    this.logger.warn(
      `Redis no responde y el freno de cuentas cuenta en memoria: ${
        error instanceof Error ? error.message : 'causa desconocida'
      }`,
    );
  }
}

/** La huella del correo, igual lo escriban con mayúsculas o con espacios. */
function claveDe(correo: string): string {
  const huella = createHash('sha256')
    .update(correo.trim().toLowerCase())
    .digest('hex');
  return `freno-de-cuenta:${huella}`;
}
