import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
} from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ required: false, example: 'Federico' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ required: false, example: 'Martino' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ required: false, example: '600123456' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, example: 'Profesional con 10 años de experiencia' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ required: false, example: 'Calle Mayor 1, Madrid' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false, example: 'Madrid' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false, example: '28001' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ required: false, example: 40.4168 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({ required: false, example: -3.7038 })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
