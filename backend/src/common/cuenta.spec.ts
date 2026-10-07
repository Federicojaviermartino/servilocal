import { ForbiddenException } from '@nestjs/common';
import {
  CODIGO_CUENTA_DEMOSTRACION,
  VERSION_TERMINOS,
  comprobarQueNoEsDeDemostracion,
  normalizarCorreo,
  segundoActual,
} from './cuenta';

/**
 * Las piezas de la cuenta que usan a la vez el registro, el acceso y la
 * recuperación. Las pruebas de mutación las encontraron sin probar por su
 * cuenta: un toUpperCase en lugar de toLowerCase seguía en verde.
 */
describe('normalizarCorreo', () => {
  it('quita los espacios y pasa a minúsculas', () => {
    // Si no, «Ana@Ejemplo.com » sería otra cuenta distinta de
    // «ana@ejemplo.com», y no podría entrar con ninguna de las dos formas.
    expect(normalizarCorreo('  Ana@Ejemplo.COM ')).toBe('ana@ejemplo.com');
  });

  it.each([undefined, null, 3, { email: 'a@b.c' }])(
    'lo que no es texto lo deja como llega (%o), para que lo rechace la validación',
    (valor) => {
      expect(normalizarCorreo(valor)).toBe(valor);
    },
  );
});

describe('comprobarQueNoEsDeDemostracion', () => {
  it('una cuenta real puede cambiar su contraseña o eliminarse', () => {
    expect(() =>
      comprobarQueNoEsDeDemostracion({
        esDemostracion: false,
        soloLectura: false,
      }),
    ).not.toThrow();
    expect(() => comprobarQueNoEsDeDemostracion({})).not.toThrow();
  });

  it.each([
    ['de demostración', { esDemostracion: true }],
    ['de solo lectura', { soloLectura: true }],
  ])('una %s, no: su contraseña está publicada', (_caso, cuenta) => {
    const error = (() => {
      try {
        comprobarQueNoEsDeDemostracion(cuenta);
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      statusCode: 403,
      codigo: CODIGO_CUENTA_DEMOSTRACION,
      message: expect.stringContaining('cuentas de demostración'),
    });
  });

  it('el código es el que traduce el frontend', () => {
    expect(CODIGO_CUENTA_DEMOSTRACION).toBe('cuenta-de-demostracion');
  });
});

describe('VERSION_TERMINOS', () => {
  it('es una fecha válida y no del futuro', () => {
    // Se guarda con cada aceptación: una versión vacía o mal escrita dejaría
    // sin saber qué textos aceptó cada cuenta.
    expect(VERSION_TERMINOS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const fecha = new Date(`${VERSION_TERMINOS}T00:00:00Z`);
    expect(Number.isNaN(fecha.getTime())).toBe(false);
    expect(fecha.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('segundoActual', () => {
  it('es el segundo en curso, sin milisegundos', () => {
    const antes = Math.floor(Date.now() / 1000) * 1000;

    const ahora = segundoActual().getTime();

    expect(ahora % 1000).toBe(0);
    expect(ahora).toBeGreaterThanOrEqual(antes);
    expect(ahora).toBeLessThanOrEqual(Date.now());
  });
});
