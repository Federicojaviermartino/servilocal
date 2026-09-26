import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { Booking, Service, User } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Service, User]),
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
