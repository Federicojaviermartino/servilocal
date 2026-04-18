import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'uuid-recipient', description: 'ID del destinatario' })
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  @ApiProperty({ example: 'Hola, me gustaría consultar la disponibilidad para la semana que viene.' })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ReplyMessageDto {
  @ApiProperty({ example: 'Claro, tengo disponibilidad el martes y jueves por la mañana.' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
