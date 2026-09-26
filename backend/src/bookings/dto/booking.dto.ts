import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { BookingStatus } from '../../entities';
import { PRECIO_MINIMO } from '../../common/calendario';

export class CreateBookingDto {
  // Con @IsString, un identificador mal formado llegaba a la base de datos
  // y volvía como un 500. Ahora se rechaza aquí, con un 400 que explica qué
  // pasa. El README ya afirmaba esto, y solo era cierto para los parámetros
  // de ruta, que sí pasan por ParseUUIDPipe.
  @ApiProperty({ example: 'uuid-service' })
  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @ApiProperty({ example: '2026-04-15T10:00:00Z' })
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional({
    example: 'Necesito reparar un grifo que gotea en la cocina',
  })
  @IsOptional()
  @IsString()
  description?: string;

  // Se mantiene porque la ficha publica una horquilla y el cliente elige
  // dentro de ella. Lo que ya no se mantiene es creérselo: el servicio
  // comprueba que cae dentro del rango de ESE servicio antes de guardarlo.
  @ApiProperty({ example: 45.0 })
  @IsNumber()
  @Min(PRECIO_MINIMO)
  totalPrice: number;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: ['confirmed', 'completed', 'cancelled', 'rejected'] })
  @IsEnum(BookingStatus)
  status: BookingStatus;

  /**
   * Completar aunque no haya pago retenido. Sin esto, completar una reserva
   * sin retención responde 409 para que el profesional decida: esperar a que
   * el cliente pague, o darla por hecha sin cobro, y que pague después.
   */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  sinCobro?: boolean;

  @ApiPropertyOptional({ example: 'No puedo asistir por motivos personales' })
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}
