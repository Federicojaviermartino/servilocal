import { BadRequestException } from '@nestjs/common';

/** Una contraseña de las que se prueban primero. */
export const CODIGO_CONTRASENA_COMUN = 'contrasena-comun';

/**
 * Las que más se repiten en las filtraciones publicadas, de ocho caracteres
 * en adelante: las más cortas ya no pasan la longitud mínima. En minúsculas,
 * que es como se comparan.
 */
const COMUNES = new Set([
  // Cifras y teclado. Las series seguidas y las repeticiones no hace falta
  // listarlas: las ven las reglas de más abajo.
  '11223344',
  '12344321',
  '1234512345',
  '147258369',
  '789456123',
  '123654789',
  '1234qwer',
  'qwer1234',
  '1q2w3e4r',
  '1q2w3e4r5t',
  '1qaz2wsx',
  '1qazxsw2',
  'q1w2e3r4',
  'zaq12wsx',
  'qazwsxedc',
  'asdf1234',
  'abcd1234',
  'abc12345',
  'a1b2c3d4',
  'aa123456',
  'a1234567',
  'a12345678',
  '1234567a',
  '12345678a',
  '123456789a',
  'hello123',
  'hola1234',
  'holahola',
  'test1234',
  'testtest',
  // Palabras, con sus disfraces de siempre.
  'p@ssw0rd',
  'p@ssword',
  'pa55word',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'basketball',
  'superman',
  'starwars',
  'whatever',
  'trustno1',
  'michelle',
  'jennifer',
  'computer',
  'internet',
  'samantha',
  'liverpool',
  'chocolate',
  'butterfly',
  'minecraft',
  'metallica',
  'slipknot',
  'blink182',
  'jordan23',
  'michael1',
  'charlie1',
  'babygirl',
  'freedom1',
  'barcelona',
  'realmadrid',
  'juventus',
  'mariposa',
  'estrella',
  'teamo123',
  'alejandro',
  'alejandra',
  'fernando',
  'cristina',
  'carolina',
  'sebastian',
  'valentina',
  'gabriela',
  'santiago',
  'francisco',
  'guadalupe',
]);

/**
 * Palabras que hacen común a una contraseña la decoren como la decoren:
 * «Password123!» es «password» con lo que piden casi todos los formularios
 * puesto detrás, y es además la contraseña de las cuentas de demostración,
 * que está publicada en la página de acceso.
 */
const RAICES = new Set([
  'password',
  'passw0rd',
  'contraseña',
  'contrasena',
  'qwerty',
  'welcome',
  'bienvenido',
  'bienvenida',
  'admin',
  'administrador',
  'administrator',
  'servilocal',
  'iloveyou',
  'tequiero',
  'letmein',
  'changeme',
]);

/** Filas de un teclado y series: cualquier tramo de ellas, en un sentido u otro. */
const ESCALERAS = [
  '01234567890123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjklñ',
].flatMap((fila) => [fila, [...fila].reverse().join('')]);

/** Lo que queda al quitar las cifras y los signos de delante y de detrás. */
const sinAdornos = (texto: string): string =>
  texto.replace(/^[\d\W_]+|[\d\W_]+$/gu, '');

/**
 * Si una contraseña es de las que se prueban primero.
 *
 * No es un servicio de contraseñas filtradas, que serían cientos de
 * millones: es la lista corta de las que cualquier ataque prueba en sus
 * primeros intentos, más lo que se ve a simple vista —un carácter repetido,
 * una fila del teclado, el propio correo—. Con el freno por cuenta, que deja
 * diez intentos cada cuarto de hora, quitar estas es lo que más cambia.
 *
 * `propios` es lo que se sabe de la cuenta, como su correo.
 */
export function esContrasenaComun(
  contrasena: string,
  propios: string[] = [],
): boolean {
  const llana = contrasena.toLowerCase();
  const raiz = sinAdornos(llana);

  if (COMUNES.has(llana) || RAICES.has(raiz)) return true;
  // Un carácter, o un grupo de hasta cuatro, repetido: 11111111, abcabcabc.
  if (/^(.{1,4})\1+$/u.test(llana)) return true;
  if (ESCALERAS.some((fila) => fila.includes(llana))) return true;

  return propios
    .map((propio) => propio.trim().toLowerCase())
    .filter(Boolean)
    .some((propio) => {
      // Lo de antes de la arroba, si queda algo: de un correo que solo son
      // cifras no queda nada, y «nada» sería igual a cualquier contraseña
      // hecha de cifras y signos.
      const nombre = sinAdornos(propio.split('@')[0]);
      return (
        llana === propio ||
        raiz === propio ||
        (nombre.length > 0 && raiz === nombre)
      );
    });
}

/** Rechaza con su código la que lo sea, para que la interfaz lo explique. */
export function comprobarQueNoEsComun(
  contrasena: string,
  propios: string[] = [],
): void {
  if (!esContrasenaComun(contrasena, propios)) return;
  throw new BadRequestException({
    statusCode: 400,
    codigo: CODIGO_CONTRASENA_COMUN,
    message:
      'Esa contraseña es de las más usadas y se adivina enseguida: elige otra.',
  });
}
