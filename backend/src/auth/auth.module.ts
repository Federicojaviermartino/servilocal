import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SesionesService } from './sesiones.service';
import { SesionRevocada, User } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SesionRevocada]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // getOrThrow y no get: sin clave, la API no arranca. Con get se firmaba
      // con undefined y el fallo aparecía después, en el primer acceso, lejos
      // de su causa.
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // El tipo exige una duración con unidad ('24h', '7d'). El valor
          // viene de una variable de entorno, así que se afirma aquí.
          expiresIn: configService.get<string>(
            'JWT_EXPIRATION',
            '24h',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SesionesService],
  exports: [AuthService, JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
