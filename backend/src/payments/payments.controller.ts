import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto } from './dto/payment.dto';
import type { PeticionAutenticada } from '../auth/peticion-autenticada';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiOperation({
    summary: 'Crear intención de pago con Stripe (solo cliente)',
  })
  async createIntent(
    @Request() req: PeticionAutenticada,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentsService.createPaymentIntent(req.user.id, dto.bookingId);
  }

  @Post('confirm/:paymentIntentId')
  @ApiOperation({ summary: 'Confirmar retención de pago' })
  @ApiResponse({ status: 403, description: 'Ese pago no es tuyo' })
  @ApiResponse({ status: 400, description: 'Stripe no ha retenido nada' })
  async confirmHold(
    @Request() req: PeticionAutenticada,
    @Param('paymentIntentId') paymentIntentId: string,
  ) {
    return this.paymentsService.confirmPaymentHold(
      paymentIntentId,
      req.user.id,
    );
  }

  @Post('capture/:bookingId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cobrar el pago retenido de una reserva completada (admin)',
  })
  async capture(
    @Request() req: PeticionAutenticada,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.paymentsService.capturePayment(bookingId, {
      id: req.user.id,
      email: req.user.email,
    });
  }

  @Post('refund/:bookingId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reembolsar el pago de una reserva ya cerrada (admin)',
  })
  async refund(
    @Request() req: PeticionAutenticada,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.paymentsService.refundPayment(bookingId, {
      id: req.user.id,
      email: req.user.email,
    });
  }

  @Get('my')
  @ApiOperation({ summary: 'Mis pagos como cliente' })
  async findMy(@Request() req: PeticionAutenticada) {
    return this.paymentsService.findByClient(req.user.id);
  }

  @Get('booking/:bookingId')
  @ApiOperation({ summary: 'Pago de una reserva específica' })
  @ApiResponse({ status: 403, description: 'Esa reserva no es tuya' })
  async findByBooking(
    @Request() req: PeticionAutenticada,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.paymentsService.findByBooking(bookingId, {
      id: req.user.id,
      role: req.user.role,
    });
  }
}
