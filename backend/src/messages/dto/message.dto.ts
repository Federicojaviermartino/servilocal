import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    example: 'uuid-destinatario',
    description: 'ID del destinatario',
  })
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @ApiProperty({
    example:
      'Hola, me gustaría consultar la disponibilidad para la semana que viene.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}

export class ReplyMessageDto {
  @ApiProperty({
    example: 'Claro, tengo disponibilidad el martes y jueves por la mañana.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
