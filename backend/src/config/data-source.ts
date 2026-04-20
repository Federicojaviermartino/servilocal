import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL;

export const AppDataSource = new DataSource(
  databaseUrl
    ? {
        type: 'postgres',
        url: databaseUrl,
        ssl: { rejectUnauthorized: false },
        entities: [resolve(__dirname, '../entities/*.entity{.ts,.js}')],
        migrations: [resolve(__dirname, '../database/migrations/*{.ts,.js}')],
        synchronize: false,
        logging: true,
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'servilocal_user',
        password: process.env.DB_PASSWORD || 'servilocal_dev_2026',
        database: process.env.DB_DATABASE || 'servilocal',
        entities: [resolve(__dirname, '../entities/*.entity{.ts,.js}')],
        migrations: [resolve(__dirname, '../database/migrations/*{.ts,.js}')],
        synchronize: false,
        logging: true,
      },
);
