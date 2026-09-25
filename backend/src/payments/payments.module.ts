import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { ProgramadorRetenciones } from './programador-retenciones';
import { Payment, Booking } from '../entities';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Booking]), NotificationsModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, ProgramadorRetenciones],
  exports: [PaymentsService],
})
export class PaymentsModule {}
