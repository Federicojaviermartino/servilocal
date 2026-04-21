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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/guards/roles.guard';
import { UserRole } from '../entities';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto } from './dto/payment.dto';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiOperation({ summary: 'Crear intención de pago con Stripe (solo cliente)' })
  async createIntent(
    @Request() req: any,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentsService.createPaymentIntent(req.user.id, dto.bookingId);
  }

  @Post('confirm/:paymentIntentId')
  @ApiOperation({ summary: 'Confirmar retención de pago' })
  async confirmHold(@Param('paymentIntentId') paymentIntentId: string) {
    return this.paymentsService.confirmPaymentHold(paymentIntentId);
  }

  @Post('capture/:bookingId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Capturar pago retenido al completar servicio (admin)' })
  async capture(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.paymentsService.capturePayment(bookingId);
  }

  @Post('refund/:bookingId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reembolsar pago (admin)' })
  async refund(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.paymentsService.refundPayment(bookingId);
  }

  @Get('my')
  @ApiOperation({ summary: 'Mis pagos como cliente' })
  async findMy(@Request() req: any) {
    return this.paymentsService.findByClient(req.user.id);
  }

  @Get('booking/:bookingId')
  @ApiOperation({ summary: 'Pago de una reserva específica' })
  async findByBooking(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.paymentsService.findByBooking(bookingId);
  }
}
