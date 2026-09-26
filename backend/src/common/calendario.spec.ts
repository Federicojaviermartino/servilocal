import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  CODIGO_ANTES_DE_LA_FECHA,
  CODIGO_FECHA_LEJANA,
  CODIGO_FECHA_PASADA,
  CODIGO_SOLAPE,
  DIAS_DE_ANTELACION_MAXIMA,
  comprobarFechaNueva,
  comprobarQueHaLlegado,
  comprobarQueNoHaPasado,
  errorDeSolape,
  esSolape,
} from './calendario';

const AHORA = new Date('2027-03-10T12:00:00Z');
const DENTRO_DE = (minutos: number) =>
  new Date(AHORA.getTime() + minutos * 60_000);

/** El código con el que la interfaz reconoce cada rechazo. */
function codigoDe(ejecutar: () => void): string | undefined {
  try {
    ejecutar();
  } catch (error) {
    return ((error as BadRequestException).getResponse() as { codigo?: string })
      .codigo;
  }
  return undefined;
}

describe('Las fechas de una reserva', () => {
  describe('al pedirla', () => {
    it('una fecha por venir vale', () => {
      expect(() => comprobarFechaNueva(DENTRO_DE(60), AHORA)).not.toThrow();
    });

    it('una pasada no, con su código', () => {
      expect(() => comprobarFechaNueva(DENTRO_DE(-1), AHORA)).toThrow(
        BadRequestException,
      );
      expect(codigoDe(() => comprobarFechaNueva(DENTRO_DE(-1), AHORA))).toBe(
        CODIGO_FECHA_PASADA,
      );
    });

    it('ni la de este mismo instante', () => {
      expect(codigoDe(() => comprobarFechaNueva(AHORA, AHORA))).toBe(
        CODIGO_FECHA_PASADA,
      );
    });

    it('ni una que no es una fecha', () => {
      expect(
        codigoDe(() => comprobarFechaNueva(new Date('no es una fecha'), AHORA)),
      ).toBe(CODIGO_FECHA_PASADA);
    });

    it('el último día del horizonte entra, el siguiente no', () => {
      const limite = new Date(AHORA);
      limite.setDate(limite.getDate() + DIAS_DE_ANTELACION_MAXIMA);

      expect(() => comprobarFechaNueva(limite, AHORA)).not.toThrow();
      expect(
        codigoDe(() =>
          comprobarFechaNueva(new Date(limite.getTime() + 60_000), AHORA),
        ),
      ).toBe(CODIGO_FECHA_LEJANA);
    });
  });

  describe('al aceptarla', () => {
    it('se acepta mientras su hora no ha pasado', () => {
      expect(() => comprobarQueNoHaPasado(DENTRO_DE(5), AHORA)).not.toThrow();
    });

    it('una cuya hora ya pasó no compromete a nada', () => {
      expect(codigoDe(() => comprobarQueNoHaPasado(DENTRO_DE(-5), AHORA))).toBe(
        CODIGO_FECHA_PASADA,
      );
    });
  });

  describe('al completarla', () => {
    it('antes de su fecha no: sería cobrar un trabajo por hacer', () => {
      expect(codigoDe(() => comprobarQueHaLlegado(DENTRO_DE(60), AHORA))).toBe(
        CODIGO_ANTES_DE_LA_FECHA,
      );
    });

    it('desde su hora, sí', () => {
      expect(() => comprobarQueHaLlegado(AHORA, AHORA)).not.toThrow();
      expect(() => comprobarQueHaLlegado(DENTRO_DE(-60), AHORA)).not.toThrow();
    });
  });

  describe('dos reservas que se pisan', () => {
    const errorDeLaBase = (code: string) =>
      new QueryFailedError('UPDATE "bookings" ...', [], {
        code,
      } as unknown as Error);

    it('se reconocen por el código de la restricción de exclusión', () => {
      expect(esSolape(errorDeLaBase('23P01'))).toBe(true);
    });

    it('y no por cualquier otro error de la base', () => {
      expect(esSolape(errorDeLaBase('23505'))).toBe(false);
      expect(esSolape(new Error('23P01'))).toBe(false);
      expect(esSolape(undefined)).toBe(false);
    });

    it('se rechazan con un 409 y su código', () => {
      const error = errorDeSolape();

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ codigo: CODIGO_SOLAPE });
    });
  });
});
