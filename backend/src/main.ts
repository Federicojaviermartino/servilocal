import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { origenesPermitidos } from './common/origenes';
import { AppModule } from './app.module';
import { iniciarSentry } from './common/observabilidad/sentry';
import { FiltroDeExcepciones } from './common/filters/excepciones.filter';

async function bootstrap() {
  // Antes de crear la aplicación, para que la instrumentación alcance a todo
  // lo que se cargue después.
  const sentryActivo = iniciarSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Render sirve detrás de un proxy: sin esto todas las peticiones parecen
  // venir de la misma IP y el límite de peticiones afectaría a todos a la vez.
  app.set('trust proxy', 1);

  app.use(helmet());

  app.enableCors({
    origin: origenesPermitidos(),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalFilters(new FiltroDeExcepciones());

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
  console.log(`Documentación Swagger en http://localhost:${port}/api/docs`);
  console.log(
    sentryActivo
      ? 'Sentry activo: los errores no controlados se reportarán'
      : 'Sentry inactivo: define SENTRY_DSN para activarlo',
  );
}

bootstrap();
