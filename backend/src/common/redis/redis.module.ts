import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AlmacenThrottlerTolerante } from './almacen-throttler';
import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

/**
 * Redis, global y opcional.
 *
 * Global porque lo usan tres sitios que no se conocen entre sí —el limitador,
 * la pasarela de sockets y la caché— y pasarlo por el árbol de módulos solo
 * añadiría importaciones sin aportar aislamiento.
 *
 * El almacén del limitador se registra siempre, también sin REDIS_URL: en ese
 * caso delega en el comportamiento de memoria. Así app.module no tiene que
 * decidir nada según la configuración, que es donde aparecen los «en
 * producción hace otra cosa» difíciles de probar.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisService,
    CacheService,
    AlmacenThrottlerTolerante,
    { provide: ThrottlerStorage, useExisting: AlmacenThrottlerTolerante },
  ],
  exports: [RedisService, CacheService, ThrottlerStorage],
})
export class RedisModule {}
