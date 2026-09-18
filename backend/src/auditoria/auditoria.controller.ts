import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
import { AuditoriaService } from './auditoria.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  // Solo lectura, y solo administración: el historial registra lo que hace
  // quien modera, así que no puede consultarlo cualquiera.
  //
  // No hay ruta para crear ni para borrar entradas. Se anotan desde dentro,
  // al ejecutarse la acción, y no existe forma de retocarlas después.
  @Get()
  @ApiOperation({ summary: 'Historial de acciones de administración' })
  @ApiResponse({ status: 403, description: 'Requiere rol de administrador' })
  listar(
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
  ) {
    return this.auditoria.listar(pagina);
  }
}
