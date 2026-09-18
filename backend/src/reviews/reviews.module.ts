import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { Review, Booking, Service } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, Booking, Service]),
    NotificationsModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
