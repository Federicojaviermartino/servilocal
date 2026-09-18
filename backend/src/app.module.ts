import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { getDatabaseConfig } from './config/database.config';
import { SoloLecturaInterceptor } from './common/interceptores/solo-lectura.interceptor';
import { RedisModule } from './common/redis/redis.module';
import { TiempoRealModule } from './common/tiempo-real/tiempo-real.module';
import { ThrottlerVisitanteGuard } from './common/guards/throttler-visitante.guard';
import { DiagnosticoController } from './common/diagnostico/diagnostico.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ServicesModule } from './services/services.module';
import { BookingsModule } from './bookings/bookings.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaymentsModule } from './payments/payments.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { IaModule } from './ia/ia.module';
import configIa from './ia/ia.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // Sin este load, configService.get('ia.x') devuelve undefined en
      // silencio y toda la capa se comporta como si no estuviera configurada.
      load: [configIa],
    }),
    // Límite general por IP. Las rutas sensibles lo endurecen con @Throttle.
    RedisModule,
    TiempoRealModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    ServicesModule,
    BookingsModule,
    ReviewsModule,
    PaymentsModule,
    MessagesModule,
    NotificationsModule,
    HealthModule,
    AdminModule,
    IaModule,
  ],
  controllers: [DiagnosticoController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerVisitanteGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SoloLecturaInterceptor,
    },
  ],
})
export class AppModule {}
