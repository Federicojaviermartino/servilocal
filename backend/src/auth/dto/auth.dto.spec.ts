import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { esContrasenaComun } from '../../common/contrasenas-comunes';
import { RegisterDto } from './auth.dto';

/** Donde @nestjs/swagger guarda lo que declara @ApiProperty de cada campo. */
const PROPIEDADES = 'swagger/apiModelProperties';

/** El cuerpo que la documentación propone para probar una ruta. */
const ejemploDe = (dto: new () => object): Record<string, unknown> => {
  const campos: string[] = (
    Reflect.getMetadata(`${PROPIEDADES}Array`, dto.prototype) ?? []
  ).map((campo: string) => campo.replace(/^:/, ''));
  return Object.fromEntries(
    campos
      .map((campo) => [
        campo,
        Reflect.getMetadata(PROPIEDADES, dto.prototype, campo)?.example,
      ])
      .filter(([, ejemplo]) => ejemplo !== undefined),
  );
};

describe('Los ejemplos de la documentación', () => {
  it('el del registro pasa la validación tal cual', async () => {
    const ejemplo = ejemploDe(RegisterDto);

    const errores = await validate(plainToInstance(RegisterDto, ejemplo));

    expect(Object.keys(ejemplo)).toEqual(
      expect.arrayContaining(['email', 'password', 'role', 'aceptaTerminos']),
    );
    expect(errores).toEqual([]);
  });

  it('y su contraseña es una que el registro admite', () => {
    // Era «Password123!», que desde que se rechazan las contraseñas comunes
    // da un 400: quien probaba el ejemplo tal cual no conseguía registrarse.
    const { email, password } = ejemploDe(RegisterDto);

    expect(typeof password).toBe('string');
    expect(esContrasenaComun(String(password), [String(email)])).toBe(false);
  });
});
