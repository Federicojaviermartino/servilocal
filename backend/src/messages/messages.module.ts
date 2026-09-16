import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MensajesGateway } from './mensajes.gateway';
import { Conversation, Message, User } from '../entities';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule aporta el JwtModule ya configurado con el mismo secreto que
  // firma los tokens: registrarlo otra vez aquí sería un segundo sitio donde
  // equivocarse de clave.
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, User]),
    ConfigModule,
    AuthModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MensajesGateway],
  exports: [MessagesService],
})
export class MessagesModule {}
