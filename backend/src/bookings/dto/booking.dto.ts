import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: 'uuid-service' })
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @ApiProperty({ example: '2026-04-15T10:00:00Z' })
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional({ example: 'Necesito reparar un grifo que gotea en la cocina' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 45.00 })
  @IsNumber()
  @Min(0)
  totalPrice: number;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: ['confirmed', 'completed', 'cancelled', 'rejected'] })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({ example: 'No puedo asistir por motivos personales' })
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}
