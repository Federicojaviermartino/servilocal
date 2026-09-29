import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { SiSeEnvia } from '../../common/si-se-envia';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Fontanería' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'fontaneria' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  @ApiProperty({
    required: false,
    example: 'Servicios de fontanería y reparación de tuberías',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, example: 'wrench' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ required: false, description: 'ID de la categoría padre' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiProperty({ required: false })
  @SiSeEnvia()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ required: false })
  @SiSeEnvia()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @SiSeEnvia()
  @IsNumber()
  sortOrder?: number;
}
