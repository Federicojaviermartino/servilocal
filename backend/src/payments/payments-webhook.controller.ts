import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  ServiceUnavailableException,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import Stripe from 'stripe';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      { apiVersion: '2023-10-16' },
    );
    this.webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
  }

  // Fuera del límite de peticiones: quien llama es Stripe, desde unas pocas
  // direcciones, y lo que lo autentica es la firma. Con el límite general,
  // una ráfaga de avisos recibía un 429 y Stripe los reintentaba cada vez
  // más tarde: los pagos se anotaban con retraso.
  @SkipThrottle()
  @Post('webhook')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Recibe eventos de Stripe (verificados por firma)' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Webhook de Stripe no configurado en el servidor',
      );
    }
    if (!signature) {
      throw new BadRequestException('Falta cabecera stripe-signature');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Cuerpo vacío en el webhook');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      throw new BadRequestException(
        `Firma inválida en el webhook de Stripe: ${
          error instanceof Error ? error.message : 'causa desconocida'
        }`,
      );
    }

    await this.paymentsService.handleWebhookEvent(event);
    return { received: true };
  }
}
