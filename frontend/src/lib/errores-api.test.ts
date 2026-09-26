import { describe, expect, it } from 'vitest';
import {
  CODIGO_DEMOSTRACION,
  codigoDeError,
  textoDeError,
} from './errores-api';

describe('codigoDeError', () => {
  it('lee el código que manda la API junto al rechazo', () => {
    expect(
      codigoDeError({
        response: { status: 403, data: { codigo: CODIGO_DEMOSTRACION } },
      }),
    ).toBe('demostracion');
  });

  it.each([
    ['sin código', { response: { status: 500, data: {} } }],
    ['sin respuesta (red caída)', { code: 'ECONNABORTED' }],
    ['nada', undefined],
  ])('%s, no hay código', (_caso, error) => {
    expect(codigoDeError(error)).toBeUndefined();
  });

  it('un 429 del limitador cuenta como «demasiadas peticiones»', () => {
    // El limitador no pone código; sin esto, la pantalla decía solo «no se
    // ha podido» y quien reintentaba volvía a chocar.
    expect(codigoDeError({ response: { status: 429, data: {} } })).toBe(
      'demasiadas-peticiones',
    );
  });

  it('pero si el 429 trae su propio código, manda ese', () => {
    expect(
      codigoDeError({ response: { status: 429, data: { codigo: 'otro' } } }),
    ).toBe('otro');
  });
});

describe('textoDeError', () => {
  // Un catálogo de mentira que solo conoce «solape».
  const tErrores = Object.assign((clave: string) => `texto de ${clave}`, {
    has: (clave: string) => clave === 'solape',
  }) as never;

  it('un código que el catálogo conoce se explica en el idioma', () => {
    expect(
      textoDeError(
        { response: { status: 409, data: { codigo: 'solape' } } },
        tErrores,
        'alternativa',
      ),
    ).toBe('texto de solape');
  });

  it('uno que no conoce, o ninguno, deja el texto de la pantalla', () => {
    expect(
      textoDeError(
        { response: { status: 409, data: { codigo: 'otro' } } },
        tErrores,
        'alternativa',
      ),
    ).toBe('alternativa');
    expect(
      textoDeError({ code: 'ECONNABORTED' }, tErrores, 'alternativa'),
    ).toBe('alternativa');
  });
});
