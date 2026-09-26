import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 'uuid-booking' })
  @IsUUID()
  bookingId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    example: 'Excelente trabajo, muy profesional y puntual.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ProviderResponseDto {
  @ApiProperty({
    example: 'Gracias por tu valoración, fue un placer atenderte.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  providerResponse: string;
}

export class ReportReviewDto {
  @ApiProperty({ example: 'Contenido ofensivo o spam' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reportReason: string;
}
