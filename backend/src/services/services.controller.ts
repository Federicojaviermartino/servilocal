import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
import { ServicesService } from './services.service';
import {
  CreateServiceDto,
  UpdateServiceDto,
  SearchServicesDto,
} from './dto/service.dto';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get('search')
  @ApiOperation({ summary: 'Buscar servicios con filtros y geolocalización (público)' })
  @ApiResponse({ status: 200, description: 'Resultados de búsqueda paginados' })
  async search(@Query() searchDto: SearchServicesDto) {
    return this.servicesService.search(searchDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener servicio por ID (público)' })
  @ApiResponse({ status: 200, description: 'Detalle del servicio' })
  async findOne(@Param('id') id: string) {
    return this.servicesService.findById(id);
  }

  @Get('provider/:providerId')
  @ApiOperation({ summary: 'Listar servicios de un proveedor (público)' })
  @ApiResponse({ status: 200, description: 'Servicios del proveedor' })
  async findByProvider(@Param('providerId') providerId: string) {
    return this.servicesService.findByProvider(providerId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear servicio (solo proveedor)' })
  @ApiResponse({ status: 201, description: 'Servicio creado' })
  async create(@Request() req: any, @Body() createDto: CreateServiceDto) {
    return this.servicesService.create(req.user.id, createDto);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar servicio (solo el proveedor dueño)' })
  @ApiResponse({ status: 200, description: 'Servicio actualizado' })
  async update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateDto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, req.user.id, updateDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar servicio (proveedor dueño o admin)' })
  @ApiResponse({ status: 200, description: 'Servicio eliminado' })
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.servicesService.remove(id, req.user.id, req.user.role);
    return { message: 'Servicio eliminado correctamente' };
  }
}
