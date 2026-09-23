import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  AUDIENCIA_API,
  AUDIENCIA_SOCKET,
  DURACION_PASE_SOCKET,
} from './sesion';

/** El token y cuándo deja de valer, que es cuando tiene que caducar la cookie. */
export interface SesionEmitida extends AuthResponseDto {
  caduca: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<SesionEmitida> {
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este email');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(registerDto.password, salt);

    const user = this.userRepository.create({
      ...registerDto,
      password: hashedPassword,
    });

    const savedUser = await this.userRepository.save(user);

    return this.generateAuthResponse(savedUser);
  }

  async login(loginDto: LoginDto): Promise<SesionEmitida> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
      // password está marcada como no seleccionable: aquí hace falta.
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        soloLectura: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Cuenta desactivada');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    return this.generateAuthResponse(user);
  }

  /**
   * Pase de un minuto para abrir el socket.
   *
   * El socket va directo a la API, que está en otro sitio, así que no lleva
   * la cookie. Se le da esto en su lugar: caduca enseguida y no sirve como
   * sesión, porque va firmado para otra audiencia.
   */
  ticketDeSocket(usuarioId: string): string {
    return this.jwtService.sign(
      { sub: usuarioId },
      { audience: AUDIENCIA_SOCKET, expiresIn: DURACION_PASE_SOCKET },
    );
  }

  private generateAuthResponse(user: User): SesionEmitida {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      audience: AUDIENCIA_API,
    });
    // Se lee del propio token en vez de volver a interpretar JWT_EXPIRATION:
    // así la cookie y el token no pueden caducar en momentos distintos.
    const { exp } = this.jwtService.decode<{ exp: number }>(accessToken);

    return {
      accessToken,
      caduca: new Date(exp * 1000),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        soloLectura: user.soloLectura ?? false,
      },
    };
  }
}
