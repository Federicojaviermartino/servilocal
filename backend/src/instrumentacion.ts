import { iniciarSentry } from './common/observabilidad/sentry';

/**
 * Sentry, antes de que se cargue nada más.
 *
 * Su instrumentación se engancha a cada biblioteca en el momento en que se
 * carga. Iniciado dentro de bootstrap(), como estaba, llegaba con Express y
 * el cliente de PostgreSQL ya cargados por los imports de main.ts, y se
 * quedaba esperándolos para siempre: recogía los errores, pero ninguna traza
 * decía por qué ruta ni por qué consulta había pasado la petición.
 *
 * Comprobado con el SDK y su registro de depuración. Cargando Express y pg
 * después de Sentry.init, anota «"router" injected at runtime» y «"pg"
 * injected at runtime»; cargándolos antes, no anota ninguna de las dos.
 *
 * Por eso es un módulo aparte, y main.ts lo importa justo detrás del .env,
 * del que sale SENTRY_DSN. El orden lo vigila arranque.spec.ts.
 */
export const sentryActivo = iniciarSentry();
