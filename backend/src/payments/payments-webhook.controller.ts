import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      { apiVersion: '2023-10-16' },
    );
    this.webhookSecret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
  }

  @Post('webhook')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Recibe eventos de Stripe (verificados por firma)' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Falta cabecera stripe-signature');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Body vacio en el webhook');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err: any) {
      throw new BadRequestException(
        `Firma invalida en webhook de Stripe: ${err?.message}`,
      );
    }

    await this.paymentsService.handleWebhookEvent(event);
    return { received: true };
  }
}
