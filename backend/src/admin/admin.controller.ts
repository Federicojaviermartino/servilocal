import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metricas')
  @ApiOperation({
    summary: 'Agregados de la plataforma (solo admin)',
    description:
      'Recuentos de usuarios, servicios, reservas, valoraciones y categorías, ' +
      'calculados en la base de datos. Sustituye a descargar las listas ' +
      'completas para contarlas en el navegador.',
  })
  @ApiResponse({ status: 200, description: 'Agregados de la plataforma' })
  @ApiResponse({ status: 403, description: 'Requiere rol de administrador' })
  metricas() {
    return this.adminService.metricas();
  }

  @Get('reputacion')
  @ApiOperation({
    summary: 'Reputación agregada por profesional (solo admin)',
    description:
      'Media de valoraciones de toda la persona, no de cada servicio por ' +
      'separado, con su volumen, reservas completadas y tasa de respuesta.',
  })
  @ApiResponse({ status: 200, description: 'Listado ordenado por reputación' })
  @ApiResponse({ status: 403, description: 'Requiere rol de administrador' })
  reputacion() {
    return this.adminService.reputacion();
  }
}
