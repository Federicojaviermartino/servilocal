import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { RedisService } from './redis.service';

/**
 * Contador del limitador de peticiones, en Redis y tolerante a fallos.
 *
 * Por qué en Redis: el contador vivía en la memoria del proceso, así que se
 * reiniciaba con cada despliegue —quien había agotado su cuota la recuperaba
 * publicando una línea— y no se compartía entre instancias, de modo que con
 * dos servidores el límite real era el doble del configurado. Un límite que
 * no sabes cuál es no protege de nada.
 *
 * Y tolerante porque el orden de prioridades está claro: si Redis no
 * responde, se deja pasar la petición. La alternativa es devolver un error a
 * todo el mundo porque se ha caído el contador, es decir, tumbar el sitio
 * entero para proteger un límite de tráfico. Se avisa en el registro y se
 * sigue.
 */
@Injectable()
export class AlmacenThrottlerTolerante implements ThrottlerStorage {
  private readonly logger = new Logger(AlmacenThrottlerTolerante.name);
  private readonly redis: ThrottlerStorageRedisService | null;
  /**
   * Repliegue sin Redis: el contador en memoria de siempre.
   *
   * No «dejar pasar». Sin REDIS_URL —desarrollo, integración continua, o un
   * despliegue al que se le olvidó la variable— el limitador tiene que seguir
   * limitando. Desactivarlo en silencio por no encontrar una configuración
   * sería peor que no haberlo puesto nunca, porque nadie se enteraría.
   */
  private readonly memoria = new ThrottlerStorageService();
  private avisado = false;

  constructor(servicio: RedisService) {
    const conexion = servicio.crear('throttler');
    this.redis = conexion ? new ThrottlerStorageRedisService(conexion) : null;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis) {
      return this.memoria.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }

    try {
      const registro = await this.redis.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
      this.avisado = false;
      return registro;
    } catch (error) {
      // Una vez por caída, no una por petición: con Redis abajo esto se
      // ejecuta en cada llamada y llenaría el registro en segundos.
      if (!this.avisado) {
        this.avisado = true;
        this.logger.warn(
          `Limitador sin contador: ${error instanceof Error ? error.message : 'desconocido'}. Se deja pasar el tráfico.`,
        );
      }
      return this.dejarPasar(ttl);
    }
  }

  /** Un golpe, ningún bloqueo: el guardia lo interpreta como «adelante». */
  private dejarPasar(ttl: number): ThrottlerStorageRecord {
    return {
      totalHits: 1,
      timeToExpire: ttl,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
