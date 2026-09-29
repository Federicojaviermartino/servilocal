import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  IsArray,
  Min,
  Max,
  MaxLength,
  IsUUID,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SiSeEnvia } from '../../common/si-se-envia';
import {
  DURACION_MAXIMA,
  DURACION_MINIMA,
  PRECIO_MINIMO,
} from '../../common/calendario';

export class CreateServiceDto {
  @ApiProperty({ example: 'Fontanería de urgencia 24h' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    example: 'Reparación de tuberías, grifos, cisternas y desatascos.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  description: string;

  @ApiProperty({ example: 'uuid-category' })
  @IsUUID()
  categoryId: string;

  // Stripe no cobra menos de 50 céntimos en euros: un servicio más barato
  // se publicaba y después no había forma de pagarlo.
  @ApiProperty({ example: 25.0 })
  @IsNumber()
  @Min(PRECIO_MINIMO)
  priceMin: number;

  @ApiPropertyOptional({ example: 60.0 })
  @IsOptional()
  @IsNumber()
  @Min(PRECIO_MINIMO)
  priceMax?: number;

  @ApiProperty({ example: 'hour', enum: ['hour', 'service', 'project'] })
  @IsString()
  priceUnit: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'Cuánto ocupa cada reserva en la agenda, en minutos',
  })
  @IsOptional()
  @IsInt()
  @Min(DURACION_MINIMA)
  @Max(DURACION_MAXIMA)
  durationMinutes?: number;

  // Opcionales: sin ellas, el servicio se sitúa en su ciudad. Ver
  // common/ciudades.ts.
  @ApiPropertyOptional({
    example: 40.4168,
    description:
      'Latitud de la ubicación del servicio. Sin ella, la de su ciudad.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: -3.7038,
    description:
      'Longitud de la ubicación del servicio. Sin ella, la de su ciudad.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

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

  // Direcciones https y con tope. Antes valía cualquier texto, también un
  // data: con lo que se quisiera, y sin límite de cuántas.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @MaxLength(500, { each: true })
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  images?: string[];
}

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsNumber()
  @Min(PRECIO_MINIMO)
  priceMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(PRECIO_MINIMO)
  priceMax?: number;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsString()
  priceUnit?: string;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsInt()
  @Min(DURACION_MINIMA)
  @Max(DURACION_MAXIMA)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @SiSeEnvia()
  @IsNumber()
  @Min(1)
  @Max(100)
  coverageRadiusKm?: number;

  // Direcciones https y con tope. Antes valía cualquier texto, también un
  // data: con lo que se quisiera, y sin límite de cuántas.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @MaxLength(500, { each: true })
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  images?: string[];
}

export class SearchServicesDto {
  @ApiPropertyOptional({ example: 'fontanero' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ example: 'uuid-category' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Madrid' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 40.4168 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -3.7038 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
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

  @ApiPropertyOptional({
    example: 'distance',
    enum: ['distance', 'price', 'rating', 'newest'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  // Enteros y con tope: page=1e308 llegaba a la consulta como OFFSET
  // Infinity y respondía 500, y page=1.5 pedía media página.
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(1000)
  page?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}
