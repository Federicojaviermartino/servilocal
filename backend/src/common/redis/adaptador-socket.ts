import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { ServerOptions } from 'socket.io';
import { RedisService } from './redis.service';

/**
 * Adaptador de socket.io respaldado por Redis.
 *
 * Sin él, un mensaje guardado por la instancia A solo llega a quien tenga el
 * socket abierto contra la instancia A. Con una sola instancia da igual, y
 * por eso esto no hacía falta hasta ahora; en cuanto haya dos, media
 * conversación deja de llegar y el fallo es intermitente según a qué
 * servidor te haya tocado conectarte, que es de los peores de diagnosticar.
 *
 * Hacen falta dos conexiones, una para publicar y otra para suscribirse:
 * un cliente de Redis en modo SUBSCRIBE no admite ningún otro comando.
 */
export class AdaptadorSocketRedis extends IoAdapter {
  private static readonly logger = new Logger(AdaptadorSocketRedis.name);

  private constructor(
    app: INestApplicationContext,
    private readonly crearAdaptador: ReturnType<typeof createAdapter>,
  ) {
    super(app);
  }

  /**
   * Devuelve null si no hay Redis, y entonces se usa el adaptador normal.
   * Se decide aquí y no en main.ts para que quien arranca la aplicación no
   * tenga que saber nada de esto.
   */
  static crear(
    app: INestApplicationContext,
    redis: RedisService,
  ): AdaptadorSocketRedis | null {
    const publicador = redis.crear('socket-pub', 'suscripcion');
    const suscriptor = redis.crear('socket-sub', 'suscripcion');
    if (!publicador || !suscriptor) return null;

    this.logger.log('Sockets repartidos entre instancias vía Redis.');
    return new AdaptadorSocketRedis(app, createAdapter(publicador, suscriptor));
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const servidor = super.createIOServer(port, options);
    (servidor as { adapter: (a: unknown) => void }).adapter(
      this.crearAdaptador,
    );
    return servidor;
  }
}
