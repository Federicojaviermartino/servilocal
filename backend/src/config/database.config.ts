import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { conexionPorUrl } from './conexion-segura';

/**
 * El certificado del servidor se valida por defecto: aceptarlo sin comprobar
 * deja la conexión expuesta a un intermediario. DB_SSL_PERMISIVO=true
 * desactiva la comprobación para proveedores con certificado autofirmado.
 */
const validarCertificado = (configService: ConfigService): boolean =>
  configService.get<string>('DB_SSL_PERMISIVO') !== 'true';

/**
 * Los tiempos de espera de cada conexión.
 *
 * Sin ellos, una base que no contesta dejaba cada petición esperando
 * indefinidamente, y una transacción olvidada abierta retenía sus bloqueos.
 * Quince segundos para conectar dan margen a que Neon despierte; treinta por
 * sentencia, a cualquier consulta de la aplicación; y una transacción parada
 * un minuto se cierra.
 *
 * Y cinco para esperar una fila bloqueada. Pagar una reserva la bloquea
 * mientras se habla con Stripe, que puede tardar diez segundos por intento:
 * una segunda operación sobre ella esperaba hasta los treinta de la sentencia
 * y acababa en un 500. Ahora responde 409 enseguida, y se puede reintentar;
 * un aviso de Stripe que choque se repite solo.
 *
 * Aparte, para que la integración se conecte con los mismos: con una base de
 * pruebas que espera sin límite, lo que depende de estos tiempos no se veía.
 */
export const TIEMPOS_DE_LA_BASE = {
  connectionTimeoutMillis: 15_000,
  statement_timeout: 30_000,
  lock_timeout: 5_000,
  idle_in_transaction_session_timeout: 60_000,
} as const;

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');
  const nodeEnv = configService.get<string>('NODE_ENV');

  const commonOptions = {
    type: 'postgres' as const,
    entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    // El esquema se crea y evoluciona solo mediante migraciones, también
    // en desarrollo: con synchronize activo, local y producción divergen
    // y el esquema nunca llega a crearse en los entornos desplegados.
    synchronize: false,
    migrationsRun: true,
    logging: nodeEnv === 'development',
    extra: TIEMPOS_DE_LA_BASE,
  };

  if (databaseUrl) {
    // La URL sin sus parámetros de TLS: quien decide si se verifica el
    // certificado es esto, no lo que traiga la cadena de conexión. El porqué
    // está en conexion-segura.ts.
    return {
      ...commonOptions,
      ...conexionPorUrl(databaseUrl, !validarCertificado(configService)),
    };
  }

  return {
    ...commonOptions,
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: configService.get<number>('DB_PORT', 5432),
    username: configService.get<string>('DB_USERNAME', 'servilocal_user'),
    password: configService.get<string>('DB_PASSWORD', 'servilocal_dev_2026'),
    database: configService.get<string>('DB_DATABASE', 'servilocal'),
  };
};
