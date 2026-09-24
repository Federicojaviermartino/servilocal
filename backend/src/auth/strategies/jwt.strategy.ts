import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities';
import { AUDIENCIA_API, tokenDeCookie } from '../sesion';
import { SesionesService } from '../sesiones.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** Identificador de la sesión. Lo pone jsonwebtoken al firmar. */
  jti?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private sesiones: SesionesService,
  ) {
    super({
      // Primero la cabecera, que es lo que usan Swagger, los scripts y las
      // pruebas; después la cookie, que es lo que manda el navegador.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        tokenDeCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      // Sin esto, el pase de un minuto del socket valdría como sesión.
      audience: AUDIENCIA_API,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    // Sin identificador no se puede cerrar desde el servidor, así que no se
    // acepta. Son los tokens de antes de que existiera.
    if (!payload.jti) {
      throw new UnauthorizedException('Sesión no válida');
    }

    const [user, cerrada] = await Promise.all([
      this.userRepository.findOne({
        where: { id: payload.sub, isActive: true },
      }),
      this.sesiones.estaRevocada(payload.jti),
    ]);

    if (cerrada) {
      throw new UnauthorizedException('Sesión cerrada');
    }

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado o desactivado');
    }

    return user;
  }
}
