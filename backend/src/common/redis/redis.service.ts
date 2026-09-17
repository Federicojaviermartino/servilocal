import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

/** Lo único que comparten los dos modos de conexión. */
const BASE: RedisOptions = {
  // Reintento con espera creciente y sin rendirse nunca: Render puede
  // reiniciar la instancia cuando quiera, y cuando vuelva hay que reconectar
  // solo, sin desplegar nada.
  retryStrategy: (intentos) => Math.min(intentos * 200, 5000),
};

/**
 * Para pedir datos: fallar rápido.
 *
 * Sin `enableOfflineQueue: false` los comandos enviados con Redis caído se
 * encolan y la petición HTTP que los espera se queda colgada. Preferimos el
 * fallo inmediato para poder degradar: una caché que falla al instante va a
 * la base de datos; una que tarda treinta segundos tumba la página.
 */
const CONSULTA: RedisOptions = {
  ...BASE,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
};

/**
 * Para publicar y suscribirse: encolar.
 *
 * Aquí la cola es obligatoria, y lo aprendí tirando la API. El adaptador de
 * socket.io llama a psubscribe nada más construirse, antes de que el zócalo
 * esté abierto; con la cola desactivada eso lanza una excepción sincrónica
 * durante el arranque y el proceso se muere. Encolada, la suscripción espera
 * a que haya conexión, que es lo que hace falta para sobrevivir a un
 * reinicio de Redis sin volver a desplegar.
 */
const SUSCRIPCION: RedisOptions = {
  ...BASE,
  enableOfflineQueue: true,
  maxRetriesPerRequest: null,
};

/** Las dos formas de hablar con Redis, que no toleran lo mismo. */
export type ModoConexion = 'consulta' | 'suscripcion';

/**
 * Conexión a Redis, opcional a propósito.
 *
 * Sin `REDIS_URL` la aplicación se comporta exactamente igual que antes de
 * que existiera este archivo: limitador en memoria, sockets de una sola
 * instancia y sin caché. Eso no es una concesión, es un requisito: ni el
 * entorno de desarrollo ni la integración continua van a tener un Redis
 * delante, y tampoco deberían necesitarlo.
 *
 * Y el plan gratuito de Render no persiste nada y puede reiniciarse sin
 * avisar, así que encontrarse la base vacía es funcionamiento normal: el
 * limitador vuelve a contar desde cero, la caché falla y se va a PostgreSQL.
 * Ningún uso puede tratar eso como una avería.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly url: string | undefined;
  private readonly conexiones: Redis[] = [];

  /** Conexión de uso general. Null mientras no haya URL configurada. */
  readonly cliente: Redis | null;

  constructor(config: ConfigService) {
    this.url = config.get<string>('REDIS_URL')?.trim() || undefined;
    this.cliente = this.url ? this.crear('general') : null;

    if (!this.url) {
      this.logger.log('Sin REDIS_URL: limitador en memoria y sin caché.');
    }
  }

  get disponible(): boolean {
    return this.cliente !== null;
  }

  /**
   * Abre una conexión nueva.
   *
   * El adaptador de socket.io necesita dos, una para publicar y otra para
   * suscribirse, porque un cliente en modo SUBSCRIBE no admite otros
   * comandos. Ambas van en modo suscripción. Se registran todas para poder
   * cerrarlas al apagar.
   */
  crear(nombre: string, modo: ModoConexion = 'consulta'): Redis | null {
    if (!this.url) return null;

    const conexion = new Redis(
      this.url,
      modo === 'suscripcion' ? SUSCRIPCION : CONSULTA,
    );
    // Sin este manejador, un error de conexión es una excepción no capturada
    // y tumba el proceso entero. Se registra una vez por reconexión, no por
    // comando, para no llenar el registro cuando Redis está caído.
    conexion.on('error', (error: Error) => {
      this.logger.warn(`Redis (${nombre}): ${error.message}`);
    });
    this.conexiones.push(conexion);
    return conexion;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.conexiones.map((c) => c.quit().catch(() => undefined)),
    );
  }
}
