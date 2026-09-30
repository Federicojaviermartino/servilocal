// Antes que nada, y por eso está aquí arriba en vez de junto al resto.
//
// ConfigModule carga el .env cuando Nest arranca sus módulos, y para entonces
// los ficheros de los controladores ya se importaron. Cualquier cosa que lea
// process.env al definirse —el límite de intentos de acceso, sin ir más
// lejos— se queda con el valor por defecto aunque el .env diga otra cosa. No
// fallaba: se ignoraba en silencio, que es peor.
import 'dotenv/config';
import './config/zona-horaria';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AdaptadorSocketRedis } from './common/redis/adaptador-socket';
import { RedisService } from './common/redis/redis.service';
import { AppModule } from './app.module';
import { configurarAplicacion } from './aplicacion';
import { iniciarSentry } from './common/observabilidad/sentry';
import { secretoDelProxy } from './common/proxy-frontend';
import { RegistroConPeticion } from './common/observabilidad/peticion';
import { anotarApagado } from './common/observabilidad/apagado';

async function bootstrap() {
  // Antes de crear la aplicación, para que la instrumentación alcance a todo
  // lo que se cargue después.
  const sentryActivo = iniciarSentry();

  // Con colores solo en una terminal. En Render la salida va a un fichero de
  // registro, y los códigos de color llegaban como texto: «\u001b[32m[Nest]».
  const registro = new RegistroConPeticion({
    colors: process.stdout.isTTY === true,
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: registro,
  });

  configurarAplicacion(app);

  // Render para la instancia vieja con SIGTERM en cada despliegue. Sin esto
  // no lo atendía nadie: se cortaban las peticiones y los sockets a medias,
  // no se cerraban las conexiones con la base, y el programador de
  // retenciones y Redis no llegaban a ejecutar su cierre.
  //
  // Y se sale en cuanto termina el cierre. Node es el proceso 1 del
  // contenedor, y sin useProcessExit Nest se reenvía la señal, que el
  // sistema ignora en el proceso 1: el proceso solo salía cuando no quedaba
  // nada pendiente, y una conexión reintentando lo habría tenido vivo hasta
  // que Render lo matase.
  anotarApagado(registro);
  app.enableShutdownHooks([], { useProcessExit: true });

  // Con Redis los sockets se reparten entre instancias; sin él se usa el
  // adaptador normal, que es lo correcto con una sola.
  const adaptador = AdaptadorSocketRedis.crear(app, app.get(RedisService));
  if (adaptador) app.useWebSocketAdapter(adaptador);

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
  // Sin el secreto, todo lo que llega por el frontend comparte un único
  // límite de peticiones. Funciona, pero cinco intentos de acceso por minuto
  // pasarían a ser para todos los visitantes juntos.
  console.log(
    secretoDelProxy()
      ? 'Proxy del frontend reconocido: el límite de peticiones es por visitante'
      : 'PROXY_SECRETO sin definir o con menos de 32 caracteres: lo que llegue por el frontend comparte un solo límite',
  );
}

bootstrap();
