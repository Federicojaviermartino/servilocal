import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  const corsOrigins = (
    process.env.CORS_ORIGINS ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ServiLocal API')
    .setDescription(
      'API REST del marketplace de servicios locales con geolocalización',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Autenticación y registro')
    .addTag('users', 'Gestión de usuarios')
    .addTag('categories', 'Categorías de servicios')
    .addTag('services', 'Servicios profesionales')
    .addTag('bookings', 'Sistema de reservas')
    .addTag('reviews', 'Valoraciones y reseñas')
    .addTag('messages', 'Mensajería directa')
    .addTag('payments', 'Pagos con Stripe')
    .addTag('admin', 'Panel de administración')
    .addTag('notifications', 'Notificaciones')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`ServiLocal API ejecutándose en http://localhost:${port}`);
  console.log(
    `Documentación Swagger en http://localhost:${port}/api/docs`,
  );
}

bootstrap();
