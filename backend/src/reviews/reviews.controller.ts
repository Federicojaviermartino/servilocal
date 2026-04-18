import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ProviderResponseDto, ReportReviewDto } from './dto/review.dto';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('service/:serviceId')
  @ApiOperation({ summary: 'Listar valoraciones de un servicio (público)' })
  async findByService(@Param('serviceId') serviceId: string) {
    return this.reviewsService.findByService(serviceId);
  }

  @Get('reported')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar valoraciones reportadas (solo admin)' })
  async findReported() {
    return this.reviewsService.findReported();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear valoración tras reserva completada (solo cliente)' })
  @ApiResponse({ status: 201, description: 'Valoración creada' })
  async create(@Request() req: any, @Body() createDto: CreateReviewDto) {
    return this.reviewsService.create(req.user.id, createDto);
  }

  @Patch(':id/response')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Responder a una valoración (solo proveedor)' })
  async addResponse(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: ProviderResponseDto,
  ) {
    return this.reviewsService.addProviderResponse(id, req.user.id, dto);
  }

  @Patch(':id/report')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reportar valoración inapropiada' })
  async report(@Param('id') id: string, @Body() dto: ReportReviewDto) {
    return this.reviewsService.reportReview(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar valoración (solo admin - moderación)' })
  async remove(@Param('id') id: string) {
    await this.reviewsService.deleteReview(id);
    return { message: 'Valoración eliminada correctamente' };
  }
}
