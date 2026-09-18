import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las categorías (público)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de categorías con subcategorías',
  })
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener categoría por ID (público)' })
  @ApiResponse({ status: 200, description: 'Datos de la categoría' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear categoría (solo admin)' })
  @ApiResponse({ status: 201, description: 'Categoría creada' })
  async create(@Request() req: any, @Body() createDto: CreateCategoryDto) {
    return this.categoriesService.create(createDto, {
      id: req.user.id,
      email: req.user.email,
    });
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar categoría (solo admin)' })
  @ApiResponse({ status: 200, description: 'Categoría actualizada' })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateDto, {
      id: req.user.id,
      email: req.user.email,
    });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar categoría (solo admin)' })
  @ApiResponse({ status: 200, description: 'Categoría eliminada' })
  async remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    await this.categoriesService.remove(id, {
      id: req.user.id,
      email: req.user.email,
    });
    return { message: 'Categoría eliminada correctamente' };
  }
}
