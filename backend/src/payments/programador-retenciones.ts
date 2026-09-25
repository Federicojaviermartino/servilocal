import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

/** Cada cuánto se revisan las retenciones mientras la API está despierta. */
const CADA_MS = 60 * 60 * 1000;

/** La primera, al poco de arrancar: al despertar puede haber pendientes. */
const AL_ARRANCAR_MS = 60 * 1000;

/**
 * Lanza la revisión de las retenciones cada hora.
 *
 * Dentro del proceso y no como tarea programada aparte: el plan gratuito
 * duerme la API, y una tarea externa tendría que despertarla igual. El flujo
 * que la mantiene despierta lo hace ocho horas al día, así que la revisión
 * corre varias veces al día, y con los tres días de margen que deja
 * DIAS_PARA_RENOVAR sobra.
 *
 * No arranca en las pruebas, y se apaga con RETENCIONES_AUTOMATICAS=false.
 */
@Injectable()
export class ProgramadorRetenciones
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ProgramadorRetenciones.name);
  private temporizadores: NodeJS.Timeout[] = [];

  constructor(private readonly pagos: PaymentsService) {}

  onApplicationBootstrap(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.RETENCIONES_AUTOMATICAS === 'false'
    ) {
      return;
    }
    // unref: que un temporizador pendiente no impida apagar el proceso.
    this.temporizadores = [
      setTimeout(() => void this.revisar(), AL_ARRANCAR_MS).unref(),
      setInterval(() => void this.revisar(), CADA_MS).unref(),
    ];
  }

  onModuleDestroy(): void {
    for (const temporizador of this.temporizadores) clearTimeout(temporizador);
  }

  /** Nunca lanza: una revisión que falla no puede tumbar la API. */
  async revisar(): Promise<void> {
    try {
      const { renovada, perdida, conciliada } =
        await this.pagos.revisarRetenciones();
      if (renovada || perdida || conciliada) {
        this.logger.log(
          `Retenciones revisadas: ${renovada} renovadas, ${perdida} perdidas, ` +
            `${conciliada} conciliadas con Stripe`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `La revisión de las retenciones no pudo terminar: ${
          error instanceof Error ? error.message : 'causa desconocida'
        }`,
      );
    }
  }
}
