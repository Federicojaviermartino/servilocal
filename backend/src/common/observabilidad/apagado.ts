import type { LoggerService } from '@nestjs/common';

/** Las señales con las que se apaga: Render manda SIGTERM, la terminal SIGINT. */
const SENALES = ['SIGTERM', 'SIGINT'] as const;

const CONTEXTO = 'Apagado';

/**
 * Una línea al empezar el apagado y otra al terminar.
 *
 * El apagado no dejaba rastro. Cuando una instancia salía con código 1, el
 * registro no decía si había sido al dormirse, en mitad de un despliegue o
 * sirviendo: había que deducirlo cruzando horas con otros sitios. Ahora la
 * primera línea dice qué señal llegó y la última con qué código se sale, y
 * lo que falle entre las dos es del cierre.
 *
 * Se registra antes que los manejadores de Nest, que son los que cierran:
 * así esta línea sale primero.
 */
export function anotarApagado(
  registro: LoggerService,
  proceso: NodeJS.EventEmitter = process,
): void {
  for (const senal of SENALES) {
    proceso.once(senal, () =>
      registro.log(
        `${senal}: se cierran las peticiones, los sockets, la base y Redis`,
        CONTEXTO,
      ),
    );
  }
  proceso.once('exit', (codigo: number) =>
    registro.log(`Proceso terminado con código ${codigo}`, CONTEXTO),
  );
}
