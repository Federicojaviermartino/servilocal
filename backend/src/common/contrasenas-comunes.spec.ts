import { BadRequestException } from '@nestjs/common';
import {
  CODIGO_CONTRASENA_COMUN,
  comprobarQueNoEsComun,
  esContrasenaComun,
} from './contrasenas-comunes';

describe('esContrasenaComun', () => {
  it.each([
    'iloveyou',
    'sunshine',
    'trustno1',
    '1q2w3e4r',
    'abcd1234',
    'p@ssw0rd',
    'barcelona',
    'alejandro',
  ])('«%s» es de las que más se repiten', (contrasena) => {
    expect(esContrasenaComun(contrasena)).toBe(true);
  });

  it('las mayúsculas no la hacen menos común', () => {
    expect(esContrasenaComun('ILoveYou')).toBe(true);
    expect(esContrasenaComun('SUNSHINE')).toBe(true);
  });

  it.each([
    'Password123!',
    'password1',
    '123Password',
    'Contraseña2026',
    'Qwerty123456',
    'Welcome2024!',
    'Admin1234!',
    'ServiLocal1',
    '__changeme__',
  ])('«%s» es una palabra de siempre con cifras y signos alrededor', (c) => {
    // «Password123!» es además la de las cuentas de demostración, que está
    // publicada en la página de acceso.
    expect(esContrasenaComun(c)).toBe(true);
  });

  it.each(['11111111', 'aaaaaaaaaa', '12121212', 'abcabcabc', 'qwerqwer'])(
    '«%s» es lo mismo repetido',
    (contrasena) => {
      expect(esContrasenaComun(contrasena)).toBe(true);
    },
  );

  it.each([
    '12345678',
    '1234567890',
    '23456789',
    '87654321',
    '9876543210',
    'abcdefgh',
    'hgfedcba',
    'qwertyui',
    'QWERTYUIOP',
    'asdfghjk',
    'lkjhgfdsa',
  ])('«%s» es una serie o una fila del teclado', (contrasena) => {
    expect(esContrasenaComun(contrasena)).toBe(true);
  });

  it.each([
    ['ana.garcia@correo.test', 'ana.garcia@correo.test'],
    ['ana.garcia@correo.test', 'Ana.Garcia'],
    ['ana.garcia@correo.test', 'ana.garcia2026!'],
    ['  Ana.Garcia@Correo.Test ', 'ANA.GARCIA1'],
  ])('con el correo %s, «%s» es el propio correo', (correo, contrasena) => {
    expect(esContrasenaComun(contrasena, [correo])).toBe(true);
  });

  it.each([
    'Una-clave-larga-9',
    'caballo correcto grapa pila',
    'Tr3s tristes tigres',
    'mi perro se llama Rufo',
    'x7$Kp2!mQz',
    // Contienen una palabra de las de siempre, pero no son solo eso.
    'password-de-mi-abuela',
    'el admin de casa',
    // Empiezan como una serie y no lo son.
    '12345678x9',
    'qwertyuiz',
  ])('«%s» no lo es', (contrasena) => {
    expect(esContrasenaComun(contrasena, ['ana.garcia@correo.test'])).toBe(
      false,
    );
  });

  it('un correo que solo son cifras no vuelve común a toda contraseña de cifras', () => {
    // Sin las cifras no queda nombre, y «nada» coincidía con lo que queda
    // de cualquier contraseña hecha de cifras y signos.
    expect(esContrasenaComun('93!47#28$15', ['600123456@correo.test'])).toBe(
      false,
    );
  });

  it('sin nada que se sepa de la cuenta, tampoco falla', () => {
    expect(esContrasenaComun('Una-clave-larga-9', [''])).toBe(false);
    expect(esContrasenaComun('Una-clave-larga-9')).toBe(false);
  });
});

describe('comprobarQueNoEsComun', () => {
  it('rechaza la común con su código, para que la interfaz lo explique', () => {
    const intento = () => comprobarQueNoEsComun('Password123!');

    expect(intento).toThrow(BadRequestException);
    try {
      intento();
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        statusCode: 400,
        codigo: CODIGO_CONTRASENA_COMUN,
      });
    }
  });

  it('y deja pasar la que no lo es', () => {
    expect(() => comprobarQueNoEsComun('Una-clave-larga-9')).not.toThrow();
  });
});
