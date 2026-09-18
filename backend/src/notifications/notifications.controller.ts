import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly avisos: NotificationsService) {}

  // Todas las rutas trabajan sobre los avisos de quien pregunta, tomado del
  // token. No hay ninguna que acepte un identificador de usuario: así no
  // existe la posibilidad de leer los de otro.
  @Get()
  @ApiOperation({ summary: 'Mis avisos, del más reciente al más antiguo' })
  listar(@Request() req: any) {
    return this.avisos.listar(req.user.id);
  }

  @Get('unread/count')
  @ApiOperation({ summary: 'Cuántos avisos tengo sin leer' })
  async sinLeer(@Request() req: any) {
    return { total: await this.avisos.sinLeer(req.user.id) };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar un aviso como leído' })
  @ApiResponse({ status: 404, description: 'El aviso no existe o no es tuyo' })
  marcarLeido(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.avisos.marcarLeido(id, req.user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todos como leídos' })
  marcarTodos(@Request() req: any) {
    return this.avisos.marcarTodosLeidos(req.user.id);
  }
}
