import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';

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
  async comprobar() {
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
    };

    // Un 200 con "degradado" dentro no lo detecta ningún monitor: hay que
    // devolver un código de error para que alguien se entere.
    if (baseDeDatos !== 'ok') {
      throw new ServiceUnavailableException(informe);
    }

    return informe;
  }
}
