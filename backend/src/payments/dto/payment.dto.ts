import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({ example: 'uuid-booking' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;
}

export class ConfirmPaymentDto {
  @ApiProperty({ example: 'pi_stripe_payment_intent_id' })
  @IsString()
  @IsNotEmpty()
  paymentIntentId: string;
}
