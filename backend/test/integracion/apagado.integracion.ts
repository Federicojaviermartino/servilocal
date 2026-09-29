import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WebSocketGateway } from '@nestjs/websockets';
import type Redis from 'ioredis';
import { describe, expect, it } from 'vitest';
import { AdaptadorSocketRedis } from '../../src/common/redis/adaptador-socket';
import { RedisModule } from '../../src/common/redis/redis.module';
import { RedisService } from '../../src/common/redis/redis.service';

/**
 * El apagado con Redis de verdad, como en producción.
 *
 * Desde la 2.6.0 la API cierra sus conexiones al recibir SIGTERM, y en cada
 * apagado moría con código 1: Redis se cerraba antes que los sockets, y el
 * adaptador de socket.io, al darse de baja de sus canales sobre una conexión
 * ya cerrada, dejaba un rechazo sin capturar. En el plan gratuito de Render
 * eso era cada vez que la API se dormía. Con dobles no se ve: hace falta el
 * orden real en que Nest apaga cada pieza.
 */
const URL = process.env.REDIS_INTEGRACION_URL;

// En la integración continua tiene que estar: si faltara, esta prueba se
// saltaría en silencio y el fallo podría volver sin que nadie lo viera.
if (process.env.CI && !URL) {
  throw new Error('Falta REDIS_INTEGRACION_URL en la integración continua');
}

/** Una pasarela vacía: basta con que exista para que Nest levante socket.io. */
@WebSocketGateway()
class Pasarela {}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ REDIS_URL: URL })],
    }),
    RedisModule,
  ],
  providers: [Pasarela],
})
class ModuloDePrueba {}

/** Las conexiones que ha abierto el servicio: la general, la del limitador y las dos de socket.io. */
const conexionesDe = (servicio: RedisService): Redis[] =>
  (servicio as unknown as { conexiones: Redis[] }).conexiones;

/** Espera a que todas estén listas, como en una API que lleva un rato en marcha. */
async function conexionesListas(servicio: RedisService): Promise<void> {
  const conexiones = conexionesDe(servicio);
  for (let intento = 0; intento < 50; intento++) {
    if (conexiones.every((c) => c.status === 'ready')) return;
    await new Promise((listo) => setTimeout(listo, 100));
  }
  throw new Error('Redis no llegó a estar listo');
}

describe.skipIf(!URL)('Apagar con Redis', () => {
  it('cierra sockets y Redis sin dejar rechazos sin capturar', async () => {
    const app = await NestFactory.create(ModuloDePrueba, { logger: false });
    const redis = app.get(RedisService);
    const adaptador = AdaptadorSocketRedis.crear(app, redis);
    app.useWebSocketAdapter(adaptador!);
    await app.listen(0);
    await conexionesListas(redis);

    const rechazos: unknown[] = [];
    const anotar = (motivo: unknown) => rechazos.push(motivo);
    process.on('unhandledRejection', anotar);
    try {
      await app.close();
      // Un rechazo sin capturar se avisa en una vuelta posterior del bucle.
      await new Promise((listo) => setTimeout(listo, 500));
    } finally {
      process.off('unhandledRejection', anotar);
    }

    expect(rechazos).toEqual([]);
    // Y Redis se sigue cerrando, solo que al final.
    const estados = conexionesDe(redis).map((c) => c.status);
    expect(estados).toHaveLength(4);
    expect(estados.filter((estado) => estado !== 'end')).toEqual([]);
  });
});
