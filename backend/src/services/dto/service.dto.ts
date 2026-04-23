import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateServiceDto {
  @ApiProperty({ example: 'Fontanería de urgencia 24h' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Reparación de tuberías, grifos, cisternas y desatascos.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'uuid-category' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: 25.00 })
  @IsNumber()
  @Min(0)
  priceMin: number;

  @ApiPropertyOptional({ example: 60.00 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @ApiProperty({ example: 'hour', enum: ['hour', 'service', 'project'] })
  @IsString()
  priceUnit: string;

  @ApiProperty({ example: 40.4168, description: 'Latitud de la ubicación del servicio' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: -3.7038, description: 'Longitud de la ubicación del servicio' })
  @IsNumber()
  longitude: number;

  @ApiProperty({ example: 'Calle Gran Vía 1, Madrid' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'Madrid' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ example: 15, description: 'Radio de cobertura en km' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  coverageRadiusKm?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  images?: string[];
}

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priceUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  coverageRadiusKm?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  images?: string[];
}

export class SearchServicesDto {
  @ApiPropertyOptional({ example: 'fontanero' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ example: 'uuid-category' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Madrid' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 40.4168 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({ example: -3.7038 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional({ example: 10, description: 'Radio de búsqueda en km' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  radiusKm?: number;

  @ApiPropertyOptional({ example: 3, description: 'Valoración mínima (1-5)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  priceMin?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priceMax?: number;

  @ApiPropertyOptional({ example: 'distance', enum: ['distance', 'price', 'rating', 'newest'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}
