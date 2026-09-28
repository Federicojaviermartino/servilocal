import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CambiarContrasenaDto,
  LoginDto,
  RecuperarContrasenaDto,
  RegisterDto,
  RestablecerContrasenaDto,
} from '../auth/dto/auth.dto';
import { EliminarCuentaDto, UpdateUserDto } from '../users/dto/update-user.dto';

/** Las propiedades de un DTO que la validación rechaza. */
async function rechazadas(
  clase: new () => object,
  datos: Record<string, unknown>,
): Promise<string[]> {
  const errores = await validate(plainToInstance(clase, datos));
  return errores.map((error) => error.property);
}

const REGISTRO = {
  firstName: 'Ana',
  lastName: 'Ruiz',
  email: 'ana@ejemplo.org',
  password: 'Clave12345!',
  role: 'client',
  aceptaTerminos: true,
};

describe('El registro', () => {
  it('con todo en orden, pasa', async () => {
    expect(await rechazadas(RegisterDto, REGISTRO)).toEqual([]);
  });

  it.each([
    ['sin la casilla', undefined],
    ['con la casilla sin marcar', false],
    ['con cualquier cosa que no sea sí', 'true'],
  ])('%s, no', async (_caso, valor) => {
    // Los términos exigen la mayoría de edad y el registro no la pedía.
    expect(
      await rechazadas(RegisterDto, { ...REGISTRO, aceptaTerminos: valor }),
    ).toContain('aceptaTerminos');
  });

  it('el correo se guarda sin espacios y en minúsculas', () => {
    const dto = plainToInstance(RegisterDto, {
      ...REGISTRO,
      email: '  Ana@Ejemplo.ORG ',
    });

    expect(dto.email).toBe('ana@ejemplo.org');
  });

  it('y se busca igual al entrar', () => {
    expect(
      plainToInstance(LoginDto, { email: 'ANA@ejemplo.org', password: 'x' })
        .email,
    ).toBe('ana@ejemplo.org');
  });

  it('una contraseña de más de 72 caracteres no: bcrypt ignoraría el resto', async () => {
    expect(
      await rechazadas(RegisterDto, { ...REGISTRO, password: 'a'.repeat(73) }),
    ).toContain('password');
  });

  it('un teléfono más largo que su columna, tampoco', async () => {
    expect(
      await rechazadas(RegisterDto, { ...REGISTRO, phone: '6'.repeat(21) }),
    ).toContain('phone');
  });
});

describe('La contraseña', () => {
  it('la nueva tiene al menos 8 caracteres', async () => {
    expect(
      await rechazadas(CambiarContrasenaDto, { actual: 'x', nueva: 'corta' }),
    ).toContain('nueva');
  });

  it('para recuperarla basta el correo, y el idioma, si llega, es uno de los diez', async () => {
    expect(
      await rechazadas(RecuperarContrasenaDto, { email: 'ana@ejemplo.org' }),
    ).toEqual([]);
    expect(
      await rechazadas(RecuperarContrasenaDto, {
        email: 'ana@ejemplo.org',
        idioma: 'xx',
      }),
    ).toContain('idioma');
  });

  it('un enlace que no tiene pinta de serlo no llega a buscarse', async () => {
    expect(
      await rechazadas(RestablecerContrasenaDto, {
        token: 'corto',
        nueva: 'Clave12345!',
      }),
    ).toContain('token');
  });
});

describe('El perfil', () => {
  it.each([
    ['phone', 21],
    ['postalCode', 11],
    ['city', 101],
    ['address', 256],
  ])('%s no pasa de su columna', async (campo, largo) => {
    // Llegaba a la base y volvía como un 500.
    expect(
      await rechazadas(UpdateUserDto, { [campo]: 'x'.repeat(largo) }),
    ).toContain(campo);
  });

  it('eliminar la cuenta pide la contraseña', async () => {
    expect(await rechazadas(EliminarCuentaDto, {})).toContain('contrasena');
  });
});
