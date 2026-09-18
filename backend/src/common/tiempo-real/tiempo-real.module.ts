import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module';
import { User } from '../../entities';
import { TiempoRealGateway } from './tiempo-real.gateway';

/**
 * La pasarela de sockets, disponible para todo el que la necesite.
 *
 * Vivía dentro de mensajería, que fue donde nació. Al aparecer los avisos
 * habría hecho falta o duplicarla —dos conexiones por visitante para el mismo
 * servidor— o que el módulo de notificaciones dependiera del de mensajes, que
 * no tienen nada que ver. Es global por la misma razón que Redis: la usan
 * sitios que no se conocen entre sí.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User]), ConfigModule, AuthModule],
  providers: [TiempoRealGateway],
  exports: [TiempoRealGateway],
})
export class TiempoRealModule {}
