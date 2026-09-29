import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';

/** Cada cuánto se miran las solicitudes vencidas mientras la API está despierta. */
const CADA_MS = 60 * 60 * 1000;

/** La primera, al poco de arrancar: al despertar puede haber vencidas. */
const AL_ARRANCAR_MS = 90 * 1000;

/**
 * Caduca cada hora las solicitudes cuya fecha pasó sin respuesta.
 *
 * Igual que la revisión de las retenciones, dentro del proceso: el plan
 * gratuito duerme la API, y una tarea externa tendría que despertarla. Con
 * que corra unas cuantas veces al día basta: una solicitud vencida ya no se
 * puede aceptar, y lo que importa es que no siga reteniendo dinero.
 *
 * No arranca en las pruebas, y se apaga con RETENCIONES_AUTOMATICAS=false,
 * el mismo interruptor que la revisión de las retenciones: las dos mueven
 * dinero sin que nadie pulse nada.
 */
@Injectable()
export class ProgramadorCaducidad
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ProgramadorCaducidad.name);
  private temporizadores: NodeJS.Timeout[] = [];

  constructor(private readonly reservas: BookingsService) {}

  onApplicationBootstrap(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.RETENCIONES_AUTOMATICAS === 'false'
    ) {
      return;
    }
    // unref: que un temporizador pendiente no impida apagar el proceso.
    this.temporizadores = [
      setTimeout(() => void this.caducar(), AL_ARRANCAR_MS).unref(),
      setInterval(() => void this.caducar(), CADA_MS).unref(),
    ];
  }

  onModuleDestroy(): void {
    for (const temporizador of this.temporizadores) clearTimeout(temporizador);
  }

  /** Nunca lanza: una revisión que falla no puede tumbar la API. */
  async caducar(): Promise<void> {
    try {
      const caducadas = await this.reservas.caducarPendientes();
      if (caducadas) {
        this.logger.log(`Solicitudes caducadas sin respuesta: ${caducadas}`);
      }
    } catch (error) {
      this.logger.warn(
        `La caducidad de las solicitudes no pudo terminar: ${
          error instanceof Error ? error.message : 'causa desconocida'
        }`,
      );
    }
  }
}
