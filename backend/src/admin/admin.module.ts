import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, Category, Review, Service, User } from '../entities';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Service, Booking, Review, Category]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
