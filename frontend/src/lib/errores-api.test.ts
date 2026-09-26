import { describe, expect, it } from 'vitest';
import { CODIGO_DEMOSTRACION, codigoDeError } from './errores-api';

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
});
