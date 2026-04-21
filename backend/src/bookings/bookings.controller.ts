import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
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
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingStatusDto } from './dto/booking.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiOperation({ summary: 'Crear reserva (solo cliente)' })
  @ApiResponse({ status: 201, description: 'Reserva creada' })
  async create(@Request() req: any, @Body() createDto: CreateBookingDto) {
    return this.bookingsService.create(req.user.id, createDto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Mis reservas como cliente' })
  async findMyAsClient(@Request() req: any) {
    return this.bookingsService.findByClient(req.user.id);
  }

  @Get('received')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiOperation({ summary: 'Reservas recibidas como proveedor' })
  async findMyAsProvider(@Request() req: any) {
    return this.bookingsService.findByProvider(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener reserva por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambiar estado de reserva (confirmar, completar, cancelar, rechazar)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 400, description: 'Transición de estado no válida' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() updateDto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateStatus(
      id,
      req.user.id,
      req.user.role,
      updateDto,
    );
  }
}
