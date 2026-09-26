import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

/**
 * Las reglas de fechas de una reserva.
 *
 * Se podía reservar para ayer, completar un trabajo de la semana que viene
 * —y con ello cobrarlo antes de hacerlo— y confirmar dos reservas del mismo
 * profesional a la misma hora. Los rechazos llevan un código para que la
 * interfaz los explique en cada idioma.
 */

/** Hasta cuándo se puede reservar: más allá, nadie sabe si podrá. */
export const DIAS_DE_ANTELACION_MAXIMA = 365;

/** Lo mínimo que Stripe cobra en euros: por debajo, no hay forma de pagar. */
export const PRECIO_MINIMO = 0.5;

/** Cuánto dura un servicio que no dice nada, y entre qué límites. */
export const DURACION_POR_DEFECTO = 60;
export const DURACION_MINIMA = 15;
export const DURACION_MAXIMA = 480;

export const CODIGO_FECHA_PASADA = 'fecha-pasada';
export const CODIGO_FECHA_LEJANA = 'fecha-lejana';
export const CODIGO_ANTES_DE_LA_FECHA = 'antes-de-la-fecha';
export const CODIGO_SOLAPE = 'solape';

/** Una fecha para reservar: por venir, y no más allá del horizonte. */
export function comprobarFechaNueva(fecha: Date, ahora = new Date()): void {
  if (Number.isNaN(fecha.getTime()) || fecha <= ahora) {
    throw new BadRequestException({
      statusCode: 400,
      codigo: CODIGO_FECHA_PASADA,
      message: 'La fecha de la reserva ya ha pasado: elige una por venir.',
    });
  }

  const limite = new Date(ahora);
  limite.setDate(limite.getDate() + DIAS_DE_ANTELACION_MAXIMA);
  if (fecha > limite) {
    throw new BadRequestException({
      statusCode: 400,
      codigo: CODIGO_FECHA_LEJANA,
      message: `Solo se reserva con hasta ${DIAS_DE_ANTELACION_MAXIMA} días de antelación.`,
    });
  }
}

/** Confirmar una reserva cuya hora ya pasó no compromete a nada. */
export function comprobarQueNoHaPasado(fecha: Date, ahora = new Date()): void {
  if (fecha <= ahora) {
    throw new BadRequestException({
      statusCode: 400,
      codigo: CODIGO_FECHA_PASADA,
      message: 'La hora de esta reserva ya ha pasado: no se puede aceptar.',
    });
  }
}

/** Un trabajo se da por hecho, y se cobra, cuando ha llegado su hora. */
export function comprobarQueHaLlegado(fecha: Date, ahora = new Date()): void {
  if (fecha > ahora) {
    throw new BadRequestException({
      statusCode: 400,
      codigo: CODIGO_ANTES_DE_LA_FECHA,
      message:
        'Todavía no ha llegado la fecha de la reserva: se completa a partir de entonces.',
    });
  }
}

/** El rechazo de dos reservas confirmadas que se pisan. */
export function errorDeSolape(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    codigo: CODIGO_SOLAPE,
    message: 'El profesional ya tiene otra reserva confirmada en ese horario.',
  });
}

/**
 * Si el error es la restricción de la base que impide los solapes.
 *
 * Es la que manda: dos confirmaciones a la vez de reservas distintas
 * bloquean cada una su fila, y ninguna ve a la otra. PostgreSQL sí, y hace
 * esperar a la segunda hasta saber si la primera se confirma.
 */
export function esSolape(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23P01'
  );
}
