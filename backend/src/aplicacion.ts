import {
  VERSION_NEUTRAL,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { origenesPermitidos } from './common/origenes';
import { FiltroDeExcepciones } from './common/filters/excepciones.filter';
import {
  anotarPeticion,
  identificarPeticion,
} from './common/observabilidad/peticion';

/**
 * Lo que rodea a los módulos: identificador y registro de cada petición,
 * cabeceras, cookies, CORS, prefijo, versiones, filtro de errores y
 * validación.
 *
 * Aparte de main.ts para que la prueba de permisos arranque la aplicación
 * igual que en producción. Con otra configuración, un 404 por el prefijo o
 * un 400 de validación pueden hacerse pasar por un permiso concedido o
 * esconder uno denegado.
 */
export function configurarAplicacion(app: NestExpressApplication): void {
  // Lo primero, para que hasta la respuesta de un CORS rechazado lo lleve.
  app.use(identificarPeticion);
  app.use(anotarPeticion);

  // Render sirve detrás de un proxy: sin esto todas las peticiones parecen
  // venir de la misma IP y el límite de peticiones afectaría a todos a la vez.
  app.set('trust proxy', 1);

  app.use(helmet());

  // La sesión del navegador llega en una cookie. Ver auth/sesion.ts.
  app.use(cookieParser());

  app.enableCors({
    origin: origenesPermitidos(),
    credentials: true,
    // Sin esto, un cliente de otro origen no podría leer el identificador.
    exposedHeaders: ['X-Request-Id'],
  });

  app.setGlobalPrefix('api');

  // Todo respondía bajo /api, sin número de versión, así que cualquier
  // cambio de forma en una respuesta rompía a quien ya estuviera llamando y
  // no había manera de publicar el cambio sin romperlo.
  //
  // Se registran las dos rutas a la vez: /api/v1/... es la buena, y /api/...
  // sigue funcionando porque hay una aplicación desplegada llamando así y
  // apagarla de golpe la dejaría sin servicio. Lo que se gana es que la v2,
  // cuando haga falta, pueda convivir con la v1 en vez de sustituirla.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: ['1', VERSION_NEUTRAL],
  });

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
}
