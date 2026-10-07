import { DiscoveryModule } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { opcionesDeLaBase } from './base';

/** El de @nestjs/typeorm, que no lo exporta. */
const OPCIONES_TYPEORM = 'TypeOrmModuleOptions';

/** El secreto con el que estas pruebas firman los avisos de Stripe. */
export const SECRETO_DEL_AVISO = 'whsec_solo_para_la_prueba';

/**
 * La aplicación entera, arrancada como en producción y contra la base de las
 * pruebas.
 *
 * AppModule con la configuración y las opciones de main.ts, escuchando en un
 * puerto libre. Con otra configuración, un 404 por el prefijo o un 400 de
 * validación pueden hacerse pasar por un permiso concedido, y sin el cuerpo
 * tal como llegó ninguna firma de Stripe cuadraría.
 *
 * `entorno` son las variables que cada prueba necesita distintas. Se ponen
 * antes de importar AppModule: ConfigModule lee y valida el entorno al
 * definirse el módulo. Los programadores no arrancan en las pruebas.
 */
export async function arrancarAplicacion(entorno: Record<string, string> = {}) {
  vi.stubEnv('CORS_ORIGINS', 'http://localhost:3000');
  vi.stubEnv('REDIS_URL', '');
  // Sin secreto, el aviso de Stripe responde 503 a todo: se configura para
  // que llegue a comprobar la firma, que es lo que lo protege.
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRETO_DEL_AVISO);
  for (const [clave, valor] of Object.entries(entorno)) {
    vi.stubEnv(clave, valor);
  }

  // Una línea de registro por llamada, y hay pruebas con más de trescientas.
  const escribir = process.stdout.write.bind(process.stdout);
  vi.spyOn(process.stdout, 'write').mockImplementation(((
    trozo: string | Uint8Array,
    ...resto: never[]
  ) =>
    String(trozo).startsWith('{"tipo":"peticion"')
      ? true
      : escribir(trozo, ...resto)) as typeof process.stdout.write);

  const { AppModule } = await import('../../src/app.module');
  const { configurarAplicacion, OPCIONES_DE_ARRANQUE } =
    await import('../../src/aplicacion');

  // La base, con entidades y migraciones como clases: ver base.ts. Ya viene
  // migrada.
  const modulo = await Test.createTestingModule({
    imports: [AppModule, DiscoveryModule],
  })
    .overrideProvider(OPCIONES_TYPEORM)
    .useValue({ ...opcionesDeLaBase(), migrationsRun: false })
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>({
    ...OPCIONES_DE_ARRANQUE,
    logger: false,
  });
  configurarAplicacion(app);
  await app.listen(0, '127.0.0.1');

  return {
    app,
    base: (await app.getUrl()).replace('[::1]', '127.0.0.1'),
    jwt: app.get(JwtService),
    fuente: app.get(DataSource),
    async cerrar() {
      await app.close();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    },
  };
}
