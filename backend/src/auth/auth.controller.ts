import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';

/**
 * Registro e inicio de sesión aceptan cinco intentos por minuto y por IP.
 * Sin este límite, probar contraseñas contra una cuenta conocida no tiene
 * ningún coste para el atacante.
 *
 * Se puede elevar con THROTTLE_AUTH_LIMIT para entornos de prueba, donde una
 * batería de tests inicia sesión muchas veces seguidas desde la misma IP.
 * En producción debe quedarse en el valor por defecto.
 */
const LIMITE_AUTENTICACION = {
  default: {
    limit: Number(process.env.THROTTLE_AUTH_LIMIT) || 5,
    ttl: 60000,
  },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle(LIMITE_AUTENTICACION)
  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario (cliente o proveedor)' })
  @ApiResponse({ status: 201, description: 'Usuario registrado correctamente' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Throttle(LIMITE_AUTENTICACION)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión con email y contraseña' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@Request() req: any) {
    const { password, ...userData } = req.user;
    return userData;
  }
}
