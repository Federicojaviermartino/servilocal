import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 'uuid-booking' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Excelente trabajo, muy profesional y puntual.' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ProviderResponseDto {
  @ApiProperty({ example: 'Gracias por tu valoración, fue un placer atenderte.' })
  @IsString()
  @IsNotEmpty()
  providerResponse: string;
}

export class ReportReviewDto {
  @ApiProperty({ example: 'Contenido ofensivo o spam' })
  @IsString()
  @IsNotEmpty()
  reportReason: string;
}
