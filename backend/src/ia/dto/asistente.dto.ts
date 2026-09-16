import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AsistenteDto {
  @ApiProperty({
    example: 'Se me ha roto el grifo de la cocina y vivo en Madrid',
    description:
      'Lo que necesita la persona, en cualquiera de los idiomas de la interfaz',
  })
  @IsString()
  @IsNotEmpty()
  // El tope no es cosmético: acota el coste de la llamada, que se paga por
  // tokens de entrada, y reduce la superficie de una inyección de
  // instrucciones a través del propio mensaje.
  @MaxLength(500)
  mensaje: string;
}
