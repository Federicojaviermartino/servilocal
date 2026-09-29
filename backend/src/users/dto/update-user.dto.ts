import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { SiSeEnvia } from '../../common/si-se-envia';

export class UpdateUserDto {
  @ApiProperty({ required: false, example: 'Federico' })
  @SiSeEnvia()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ required: false, example: 'Martino' })
  @SiSeEnvia()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  // Las longitudes son las de sus columnas: un teléfono de treinta
  // caracteres llegaba a la base y volvía como un 500.
  @ApiProperty({ required: false, example: '600123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({
    required: false,
    example: 'Profesional con 10 años de experiencia',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiProperty({ required: false, example: 'Calle Mayor 1, Madrid' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiProperty({ required: false, example: 'Madrid' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ required: false, example: '28001' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @ApiProperty({ required: false, example: 40.4168 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiProperty({ required: false, example: -3.7038 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class EliminarCuentaDto {
  @ApiProperty({ description: 'La contraseña, para confirmar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  contrasena: string;
}
