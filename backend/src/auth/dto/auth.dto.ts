import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { UserRole } from '../../entities';

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
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
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
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'federico@ejemplo.com' })
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

export class SocketTicketDto {
  @ApiProperty({ description: 'Válido un minuto y solo para el socket' })
  ticket: string;
}
