import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

/**
 * El certificado del servidor se valida por defecto: aceptarlo sin comprobar
 * deja la conexión expuesta a un intermediario. DB_SSL_PERMISIVO=true
 * desactiva la comprobación para proveedores con certificado autofirmado.
 */
const validarCertificado = (configService: ConfigService): boolean =>
  configService.get<string>('DB_SSL_PERMISIVO') !== 'true';

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
  };

  if (databaseUrl) {
    return {
      ...commonOptions,
      url: databaseUrl,
      ssl: { rejectUnauthorized: validarCertificado(configService) },
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
