import { ForbiddenException } from '@nestjs/common';
import {
  CODIGO_DEMOSTRACION,
  comprobarMismoMundo,
  soloVeLaDemostracion,
} from './demostracion';

const real = { esDemostracion: false };
const demo = { esDemostracion: true };

describe('comprobarMismoMundo', () => {
  it.each([
    ['real', real, real],
    ['de demostración', demo, demo],
  ])('dos cuentas %s se entienden', (_caso, una, otra) => {
    expect(() => comprobarMismoMundo(una, otra)).not.toThrow();
  });

  it.each([
    ['una de demostración con una real', demo, real],
    ['una real con una de demostración', real, demo],
  ])('%s, no', (_caso, una, otra) => {
    expect(() => comprobarMismoMundo(una, otra)).toThrow(ForbiddenException);
  });

  it('el rechazo lleva un código estable, para explicarlo en cada idioma', () => {
    try {
      comprobarMismoMundo(demo, real);
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        codigo: CODIGO_DEMOSTRACION,
        message: expect.stringContaining('demostración'),
      });
    }
    expect.assertions(1);
  });

  it('el código es el que traduce el frontend', () => {
    // erroresApi.demostracion en los diez catálogos: con otro nombre, la
    // pantalla enseñaría el genérico en lugar de explicar el rechazo.
    expect(CODIGO_DEMOSTRACION).toBe('demostracion');
  });
});

describe('soloVeLaDemostracion', () => {
  it('solo la administración de solo lectura, que es la de la demostración', () => {
    expect(soloVeLaDemostracion({ soloLectura: true })).toBe(true);
  });

  it.each([
    ['una administración normal', { soloLectura: false }],
    ['sin el dato', {}],
    ['sin nadie', undefined],
    ['con null', null],
  ])('%s lo ve todo', (_caso, quien) => {
    expect(soloVeLaDemostracion(quien)).toBe(false);
  });
});
