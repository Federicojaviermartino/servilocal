import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Caché de lecturas, con el fallo como camino normal.
 *
 * Toda la clase se resume en una regla: **un fallo de caché nunca se propaga**.
 * Ni una desconexión, ni un JSON corrupto, ni una instancia que Render acaba
 * de reiniciar en vacío. Todo eso se trata como «no estaba», que es justo lo
 * que una caché tiene que saber hacer. La alternativa —dejar que la excepción
 * suba— convierte un acelerador opcional en un punto único de fallo, que es
 * exactamente al revés de para lo que se pone.
 *
 * Por eso no hay un método que devuelva error: hay `recordar`, que te da el
 * valor venga de donde venga.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private avisado = false;

  constructor(private readonly redis: RedisService) {}

  /**
   * Devuelve lo guardado o ejecuta el cálculo y lo guarda.
   *
   * @param segundos Cuánto vive. Corto a propósito: con una caché que se
   * limpia sola no hace falta invalidar a mano en cada escritura, y olvidarse
   * de invalidar es de lo que más rabia da depurar.
   */
  async recordar<T>(
    clave: string,
    segundos: number,
    calcular: () => Promise<T>,
  ): Promise<T> {
    const cliente = this.redis.cliente;
    if (!cliente) return calcular();

    try {
      const guardado = await cliente.get(clave);
      if (guardado) return JSON.parse(guardado) as T;
    } catch (error) {
      this.avisar(error);
      return calcular();
    }

    const valor = await calcular();

    try {
      await cliente.set(clave, JSON.stringify(valor), 'EX', segundos);
    } catch (error) {
      // Se ha calculado bien; no poder guardarlo no es motivo para fallar.
      this.avisar(error);
    }

    return valor;
  }

  /** Borra una clave. Que no se pueda borrar tampoco es un error mortal. */
  async olvidar(clave: string): Promise<void> {
    try {
      await this.redis.cliente?.del(clave);
    } catch (error) {
      this.avisar(error);
    }
  }

  /** Una vez por caída, no una por petición. */
  private avisar(error: unknown): void {
    if (this.avisado) return;
    this.avisado = true;
    this.logger.warn(
      `Caché no disponible: ${error instanceof Error ? error.message : 'desconocido'}. Se lee de la base de datos.`,
    );
  }
}
