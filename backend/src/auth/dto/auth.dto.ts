import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../../entities';
import { normalizarCorreo } from '../../common/cuenta';
import { IDIOMAS } from '../../correo/plantillas';

/**
 * bcrypt solo mira los primeros 72 bytes: una contraseña más larga se
 * truncaba en silencio, y bastaba con acertar el principio.
 *
 * Bytes y no caracteres: una letra acentuada ocupa dos y una árabe también,
 * así que con 72 caracteres el tope dejaba pasar hasta 288 bytes, y lo que
 * pasaba de 72 no contaba.
 */
const MAXIMO_CONTRASENA = 72;
const caben72Bytes = () =>
  ValidateBy({
    name: 'cabeEnBcrypt',
    validator: {
      validate: (valor: unknown) =>
        typeof valor === 'string' &&
        Buffer.byteLength(valor, 'utf8') <= MAXIMO_CONTRASENA,
      defaultMessage: () =>
        `La contraseña no puede ocupar más de ${MAXIMO_CONTRASENA} bytes`,
    },
  });

export class RegisterDto {
  @ApiProperty({ example: 'Federico' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Martino' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: 'federico@ejemplo.com' })
  @Transform(({ value }) => normalizarCorreo(value))
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @caben72Bytes()
  password: string;

  @ApiProperty({
    enum: [UserRole.CLIENT, UserRole.PROVIDER],
    example: UserRole.CLIENT,
  })
  @IsEnum([UserRole.CLIENT, UserRole.PROVIDER])
  role: UserRole;

  @ApiProperty({ required: false, example: '600123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  /**
   * Ser mayor de edad y aceptar los términos y la política de privacidad.
   * El registro no pedía nada, y los términos exigen la mayoría de edad.
   */
  @ApiProperty({ example: true })
  @Equals(true, {
    message:
      'Para crear la cuenta hay que ser mayor de edad y aceptar los términos de uso y la política de privacidad.',
  })
  aceptaTerminos: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'federico@ejemplo.com' })
  @Transform(({ value }) => normalizarCorreo(value))
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  soloLectura: boolean;
  /** Cuenta de la demostración: lo que cambie en ella se restaura a la hora. */
  esDemostracion: boolean;
}

/**
 * Lo que recibe el navegador al entrar: quién es, y nada más. El token viaja
 * en la cookie, fuera del alcance de JavaScript.
 */
export class SessionResponseDto {
  @ApiProperty()
  user: SessionUser;
}

/** Para clientes de la API sin navegador: Swagger, scripts, pruebas. */
export class AuthResponseDto extends SessionResponseDto {
  @ApiProperty()
  accessToken: string;
}

export class CambiarContrasenaDto {
  @ApiProperty({ description: 'La contraseña de ahora, para confirmar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  actual: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @caben72Bytes()
  nueva: string;
}

export class RecuperarContrasenaDto {
  @ApiProperty({ example: 'federico@ejemplo.com' })
  @Transform(({ value }) => normalizarCorreo(value))
  @IsEmail()
  email: string;

  /** El idioma en que se estaba usando la interfaz: el del correo. */
  @ApiPropertyOptional({ enum: IDIOMAS, example: 'es' })
  @IsOptional()
  @IsIn(IDIOMAS)
  idioma?: string;
}

export class RestablecerContrasenaDto {
  @ApiProperty({ description: 'El que llegó en el enlace del correo' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @caben72Bytes()
  nueva: string;
}

export class SocketTicketDto {
  @ApiProperty({ description: 'Válido un minuto y solo para el socket' })
  ticket: string;
}
