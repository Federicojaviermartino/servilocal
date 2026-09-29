import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DemostracionService } from './demostracion.service';

/** Cada cuánto se devuelve la demostración a su sitio. */
const CADA_MS = 60 * 60 * 1000;

/** La primera, al poco de arrancar: al despertar puede haber pendientes. */
const AL_ARRANCAR_MS = 2 * 60 * 1000;

/**
 * Restaura la demostración cada hora, dentro del proceso como las demás
 * tareas: el plan gratuito duerme la API.
 *
 * No arranca en las pruebas, y se apaga con RESTAURAR_DEMOSTRACION=false,
 * por ejemplo en local, para trabajar con los datos de la demostración sin
 * que se deshagan.
 */
@Injectable()
export class ProgramadorDemostracion
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ProgramadorDemostracion.name);
  private temporizadores: NodeJS.Timeout[] = [];

  constructor(private readonly demostracion: DemostracionService) {}

  onApplicationBootstrap(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.RESTAURAR_DEMOSTRACION === 'false'
    ) {
      return;
    }
    // unref: que un temporizador pendiente no impida apagar el proceso.
    this.temporizadores = [
      setTimeout(() => void this.restaurar(), AL_ARRANCAR_MS).unref(),
      setInterval(() => void this.restaurar(), CADA_MS).unref(),
    ];
  }

  onModuleDestroy(): void {
    for (const temporizador of this.temporizadores) clearTimeout(temporizador);
  }

  /** Nunca lanza: una restauración que falla no puede tumbar la API. */
  async restaurar(): Promise<void> {
    try {
      const { servicios, perfiles, valoraciones, retirados } =
        await this.demostracion.restaurar();
      if (servicios || perfiles || valoraciones || retirados) {
        this.logger.log(
          `Demostración restaurada: ${servicios} servicios, ${perfiles} perfiles, ` +
            `${valoraciones} valoraciones y ${retirados} servicios nuevos borrados o retirados`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `La restauración de la demostración no pudo terminar: ${
          error instanceof Error ? error.message : 'causa desconocida'
        }`,
      );
    }
  }
}
