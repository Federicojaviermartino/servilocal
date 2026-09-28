import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Res,
  Header,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
import { UsersService } from './users.service';
import { EliminarCuentaDto, UpdateUserDto } from './dto/update-user.dto';
import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { cerrarSesion } from '../auth/sesion';
import { LIMITE_AUTENTICACION } from '../common/limites';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos los usuarios (solo admin)' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  async findAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener datos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Datos del usuario autenticado' })
  async findMe(@Request() req: PeticionAutenticada) {
    const user = await this.usersService.findById(req.user.id);
    const { password, ...result } = user;
    return result;
  }

  @Put('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar perfil propio' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  async updateProfile(
    @Request() req: PeticionAutenticada,
    @Body() updateDto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(req.user.id, updateDto);
    const { password, ...result } = user;
    return result;
  }

  /**
   * Todo lo suyo en un fichero: el derecho de acceso y el de portabilidad,
   * que la política prometía y solo se podían pedir escribiendo al autor.
   */
  @Get('me/datos')
  @UseGuards(AuthGuard('jwt'))
  @Throttle(LIMITE_AUTENTICACION)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Descargar todos mis datos (JSON)' })
  @ApiResponse({ status: 200, description: 'Fichero con los datos' })
  async exportar(
    @Request() req: PeticionAutenticada,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const dia = new Date().toISOString().slice(0, 10);
    respuesta.setHeader(
      'Content-Disposition',
      `attachment; filename="servilocal-mis-datos-${dia}.json"`,
    );
    return this.usersService.exportarDatos(req.user.id);
  }

  /**
   * Con la contraseña, para que una sesión abierta en un ordenador ajeno no
   * baste para borrar la cuenta de nadie. Cierra la sesión al terminar.
   */
  @Post('me/eliminar')
  @UseGuards(AuthGuard('jwt'))
  @Throttle(LIMITE_AUTENTICACION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar mi cuenta' })
  @ApiResponse({ status: 204, description: 'Cuenta eliminada' })
  @ApiResponse({ status: 400, description: 'Contraseña incorrecta' })
  @ApiResponse({ status: 409, description: 'Tiene reservas abiertas' })
  async eliminar(
    @Request() req: PeticionAutenticada,
    @Body() dto: EliminarCuentaDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    await this.usersService.eliminarCuenta(req.user.id, dto.contrasena);
    cerrarSesion(respuesta);
  }

  // Devuelve la ficha completa de cualquier usuario: correo, teléfono,
  // dirección y coordenadas. Con solo el guardia de sesión bastaba con
  // registrarse para leer los datos de contacto de todos los demás.
  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener usuario por ID (administración)' })
  @ApiResponse({ status: 403, description: 'Requiere rol de administrador' })
  @ApiResponse({ status: 200, description: 'Datos del usuario' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findById(id);
    const { password, ...result } = user;
    return result;
  }

  @Patch(':id/toggle-active')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activar/desactivar usuario (solo admin)' })
  @ApiResponse({ status: 200, description: 'Estado del usuario actualizado' })
  @ApiResponse({
    status: 400,
    description: 'No se puede desactivar la propia cuenta',
  })
  async toggleActive(
    @Request() req: PeticionAutenticada,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.toggleActive(id, {
      id: req.user.id,
      email: req.user.email,
    });
  }
}
