import {
  Controller,
  Post,
  Body,
  Get,
  Header,
  UseGuards,
  Request,
  Res,
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
import { ExtractJwt } from 'passport-jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request as Peticion, Response } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  AuthResponseDto,
  SessionResponseDto,
  SocketTicketDto,
} from './dto/auth.dto';
import { abrirSesion, cerrarSesion, tokenDeCookie } from './sesion';
import { SesionesService } from './sesiones.service';
import type { PeticionAutenticada } from './peticion-autenticada';

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
  constructor(
    private readonly authService: AuthService,
    private readonly sesiones: SesionesService,
  ) {}

  @Throttle(LIMITE_AUTENTICACION)
  @Post('register')
  @ApiOperation({
    summary: 'Registrar nuevo usuario (cliente o proveedor)',
    description: 'Abre la sesión del navegador con una cookie httpOnly.',
  })
  @ApiResponse({ status: 201, description: 'Usuario registrado correctamente' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<SessionResponseDto> {
    const sesion = await this.authService.register(registerDto);
    abrirSesion(respuesta, sesion);
    return { user: sesion.user };
  }

  @Throttle(LIMITE_AUTENTICACION)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión con email y contraseña',
    description:
      'Abre la sesión del navegador con una cookie httpOnly. El token no ' +
      'viaja en el cuerpo: para usar la API desde fuera de un navegador, ' +
      'POST /auth/token.',
  })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<SessionResponseDto> {
    const sesion = await this.authService.login(loginDto);
    abrirSesion(respuesta, sesion);
    return { user: sesion.user };
  }

  /**
   * Las mismas credenciales, pero el token en el cuerpo y sin cookie.
   *
   * Es una ruta aparte y no una opción de /auth/login para que el navegador
   * no tenga ninguna manera de recibir el token donde JavaScript lo lea.
   */
  @Throttle(LIMITE_AUTENTICACION)
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener un token para usar la API sin navegador',
    description:
      'Para Swagger, scripts y pruebas: se manda como Authorization: Bearer.',
  })
  @ApiResponse({ status: 200, description: 'Token emitido' })
  @ApiResponse({ status: 401, description: 'Credenciales incorrectas' })
  async token(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    const { accessToken, user } = await this.authService.login(loginDto);
    return { accessToken, user };
  }

  /**
   * Borra la cookie y cierra la sesión en el servidor: el token deja de
   * valer aunque alguien lo hubiera copiado antes. Solo esa sesión; las
   * demás de la misma cuenta siguen abiertas.
   *
   * Sin guarda a propósito: con guarda, una sesión caducada no se podría
   * cerrar. Lo que no sea un token válido simplemente no se apunta.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar la sesión',
    description:
      'Borra la cookie y revoca el token, venga en la cookie o en ' +
      'Authorization: Bearer. Las demás sesiones de la cuenta no se tocan.',
  })
  @ApiResponse({ status: 204, description: 'Sesión cerrada' })
  async logout(
    @Request() peticion: Peticion,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    cerrarSesion(respuesta);
    const tokens = new Set([
      tokenDeCookie(peticion),
      ExtractJwt.fromAuthHeaderAsBearerToken()(peticion),
    ]);
    for (const token of tokens) await this.sesiones.revocar(token);
  }

  /**
   * GET y no POST porque no cambia nada en el servidor, y eso importa: las
   * cuentas de demostración no pueden hacer POST, y sin pase se quedarían
   * sin avisos en vivo. No se guarda en ninguna caché, eso sí.
   */
  @Get('socket-ticket')
  @UseGuards(AuthGuard('jwt'))
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pase de un minuto para abrir el socket' })
  @ApiResponse({ status: 200, description: 'Pase emitido' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  socketTicket(@Request() req: PeticionAutenticada): SocketTicketDto {
    return { ticket: this.authService.ticketDeSocket(req.user.id) };
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@Request() req: PeticionAutenticada) {
    const { password, ...userData } = req.user;
    return userData;
  }
}
