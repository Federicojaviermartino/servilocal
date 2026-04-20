import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');
  const nodeEnv = configService.get<string>('NODE_ENV');

  const commonOptions = {
    type: 'postgres' as const,
    entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
    synchronize: nodeEnv === 'development',
    logging: nodeEnv === 'development',
  };

  if (databaseUrl) {
    return {
      ...commonOptions,
      url: databaseUrl,
      ssl: { rejectUnauthorized: false },
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
