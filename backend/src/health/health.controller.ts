import {
  Controller,
  Get,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { visitanteReenviado } from '../common/proxy-frontend';

/**
 * Comprobación de estado para monitorización y para el orquestador.
 *
 * No basta con responder: una API que arranca pero no alcanza la base de datos
 * está caída a efectos prácticos, así que aquí se verifica la conexión. Es
 * exactamente el fallo que tuvo este proyecto durante cuatro meses sin que
 * nada lo detectara.
 */
@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Estado del servicio y de la base de datos' })
  @ApiResponse({ status: 200, description: 'Todo operativo' })
  @ApiResponse({ status: 503, description: 'La base de datos no responde' })
  async comprobar(@Req() peticion: Request) {
    const inicio = Date.now();
    let baseDeDatos: 'ok' | 'sin respuesta' = 'ok';

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      baseDeDatos = 'sin respuesta';
    }

    const informe = {
      estado: baseDeDatos === 'ok' ? 'ok' : 'degradado',
      baseDeDatos,
      latenciaMs: Date.now() - inicio,
      enMarchaSegundos: Math.round(process.uptime()),
      momento: new Date().toISOString(),
      // Qué commit está sirviendo. Lo pone Render; la prueba de humo espera
      // a verlo para saber que el despliegue nuevo ya está atendiendo.
      version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null,
      // Si esta petición llegó por el frontend con el secreto que comparten
      // los dos servicios. Llamando a través del frontend tiene que salir
      // true: si no, los dos no tienen el mismo PROXY_SECRETO y el límite de
      // peticiones cuenta a todos los visitantes como uno. Solo dice sí o no;
      // ni el secreto ni ninguna dirección.
      atravesDelFrontend: visitanteReenviado(peticion.headers) !== null,
    };

    // Un 200 con "degradado" dentro no lo detecta ningún monitor: hay que
    // devolver un código de error para que alguien se entere.
    if (baseDeDatos !== 'ok') {
      throw new ServiceUnavailableException(informe);
    }

    return informe;
  }
}
