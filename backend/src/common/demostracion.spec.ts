import { ForbiddenException } from '@nestjs/common';
import { CODIGO_DEMOSTRACION, comprobarMismoMundo } from './demostracion';

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
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        codigo: CODIGO_DEMOSTRACION,
      });
    }
    expect.assertions(1);
  });
});
