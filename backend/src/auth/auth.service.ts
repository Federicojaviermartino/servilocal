import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { RestablecimientoContrasena, User } from '../entities';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';
import {
  CODIGO_CONTRASENA_INCORRECTA,
  CODIGO_CORREO_EN_USO,
  CODIGO_CREDENCIALES,
  CODIGO_CUENTA_DESACTIVADA,
  CODIGO_ENLACE_NO_VALIDO,
  VERSION_TERMINOS,
  comprobarQueNoEsDeDemostracion,
  segundoActual,
} from '../common/cuenta';
import { CorreoService } from '../correo/correo.service';
import { correoDeRecuperacion, esIdioma } from '../correo/plantillas';
import { urlDelFrontend } from '../common/origenes';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  AUDIENCIA_API,
  AUDIENCIA_SOCKET,
  DURACION_PASE_SOCKET,
} from './sesion';

/** Cuánto vale un enlace de recuperación. */
const DURACION_ENLACE_MS = 60 * 60 * 1000;

/**
 * Cuántos enlaces se mandan como mucho a una cuenta en una hora. El límite
 * por dirección no basta: desde muchas, cualquiera podía llenar de correos
 * el buzón de otra persona.
 */
const ENLACES_POR_HORA = 3;

const huellaDe = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const cifrar = async (contrasena: string): Promise<string> =>
  bcrypt.hash(contrasena, await bcrypt.genSalt(10));

/**
 * Una huella con la que comparar cuando el correo no existe. Sin ella, esa
 * respuesta llegaba antes que la de una contraseña equivocada, y lo que
 * tardaba decía qué correos están registrados.
 */
let huellaDeRelleno: Promise<string> | undefined;
const rellenoParaComparar = (): Promise<string> =>
  (huellaDeRelleno ??= cifrar(randomBytes(16).toString('hex')));

/** El token y cuándo deja de valer, que es cuando tiene que caducar la cookie. */
export interface SesionEmitida extends AuthResponseDto {
  caduca: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    @InjectRepository(RestablecimientoContrasena)
    private readonly enlaces: Repository<RestablecimientoContrasena>,
    private readonly correo: CorreoService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * La cuenta de un correo, sin distinguir mayúsculas. Los correos se
   * guardan ya en minúsculas, pero los anteriores a eso podían no estarlo,
   * y un índice sobre lower(email) hace que buscar así no recorra la tabla.
   */
  private buscarPorCorreo(
    email: string,
    conContrasena = false,
  ): Promise<User | null> {
    const consulta = this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email: email.toLowerCase() });
    // password está marcada como no seleccionable: aquí hace falta.
    if (conContrasena) consulta.addSelect('user.password');
    return consulta.getOne();
  }

  async register(registerDto: RegisterDto): Promise<SesionEmitida> {
    const existingUser = await this.buscarPorCorreo(registerDto.email);

    if (existingUser) {
      throw new ConflictException({
        statusCode: 409,
        codigo: CODIGO_CORREO_EN_USO,
        message: 'Ya existe un usuario con este email',
      });
    }

    const { aceptaTerminos: _aceptados, ...datos } = registerDto;
    const user = this.userRepository.create({
      ...datos,
      password: await cifrar(registerDto.password),
      // Constancia de que aceptó, y de qué texto.
      terminosAceptadosEn: new Date(),
      versionTerminos: VERSION_TERMINOS,
    });

    const savedUser = await this.userRepository.save(user);

    return this.generateAuthResponse(savedUser);
  }

  async login(loginDto: LoginDto): Promise<SesionEmitida> {
    const user = await this.buscarPorCorreo(loginDto.email, true);

    const valida = await bcrypt.compare(
      loginDto.password,
      user?.password ?? (await rellenoParaComparar()),
    );
    if (!user || !valida) {
      throw new UnauthorizedException({
        statusCode: 401,
        codigo: CODIGO_CREDENCIALES,
        message: 'Credenciales incorrectas',
      });
    }

    // Después de la contraseña: antes se respondía primero, y confirmaba a
    // cualquiera que ese correo estaba registrado aunque no supiera la clave.
    if (!user.isActive) {
      throw new UnauthorizedException({
        statusCode: 401,
        codigo: CODIGO_CUENTA_DESACTIVADA,
        message: 'Cuenta desactivada',
      });
    }

    return this.generateAuthResponse(user);
  }

  /**
   * Cambia la contraseña y cierra las demás sesiones.
   *
   * Pide la de ahora: una sesión abierta en un ordenador ajeno no debe
   * bastar para quedarse con la cuenta. Las demás sesiones dejan de valer
   * —también la de quien la hubiera robado—, y la de quien la cambia sigue
   * abierta con un token nuevo.
   */
  async cambiarContrasena(
    usuarioId: string,
    actual: string,
    nueva: string,
  ): Promise<SesionEmitida> {
    const usuario = await this.userRepository.findOne({
      where: { id: usuarioId },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        firstName: true,
        lastName: true,
        soloLectura: true,
        esDemostracion: true,
      },
    });
    if (!usuario) throw new UnauthorizedException('Sesión no válida');
    comprobarQueNoEsDeDemostracion(usuario);

    if (!(await bcrypt.compare(actual, usuario.password))) {
      // 400 y no 401: un 401 hace que la interfaz dé la sesión por
      // caducada y mande a entrar otra vez.
      throw new BadRequestException({
        statusCode: 400,
        codigo: CODIGO_CONTRASENA_INCORRECTA,
        message: 'La contraseña actual no es correcta.',
      });
    }

    await this.userRepository.update(usuario.id, {
      password: await cifrar(nueva),
      sesionesDesde: segundoActual(),
    });

    return this.generateAuthResponse(usuario);
  }

  /**
   * Manda un enlace para elegir contraseña nueva.
   *
   * Responde lo mismo exista o no la cuenta: si no, bastaría con probar
   * correos para saber quién está registrado. Por eso tampoco se dice nada
   * cuando el envío falla o la cuenta no puede recuperarse; se anota en el
   * registro del servidor.
   */
  async solicitarRecuperacion(email: string, idioma?: string): Promise<void> {
    this.correo.exigirDisponible();

    const usuario = await this.buscarPorCorreo(email);
    if (
      !usuario ||
      !usuario.isActive ||
      usuario.eliminadaEn ||
      usuario.esDemostracion ||
      usuario.soloLectura
    ) {
      return;
    }

    const recientes = await this.enlaces.count({
      where: {
        userId: usuario.id,
        createdAt: MoreThan(new Date(Date.now() - 60 * 60 * 1000)),
      },
    });
    if (recientes >= ENLACES_POR_HORA) {
      this.logger.warn(
        `Recuperación no enviada: la cuenta ${usuario.id} ya recibió ${recientes} enlaces en la última hora.`,
      );
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.enlaces.save(
      this.enlaces.create({
        userId: usuario.id,
        huella: huellaDe(token),
        caduca: new Date(Date.now() + DURACION_ENLACE_MS),
      }),
    );

    const lengua = esIdioma(idioma) ? idioma : 'es';
    // El castellano va sin prefijo en las rutas: ver i18n/routing del
    // frontend.
    const prefijo = lengua === 'es' ? '' : `/${lengua}`;
    const enlace = `${urlDelFrontend()}${prefijo}/auth/restablecer?token=${token}`;

    try {
      await this.correo.enviar(
        correoDeRecuperacion(
          lengua,
          { email: usuario.email, nombre: usuario.firstName },
          enlace,
        ),
      );
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo de recuperación a la cuenta ${usuario.id}: ${
          error instanceof Error ? error.message : 'causa desconocida'
        }`,
      );
    }
  }

  /**
   * Pone la contraseña nueva con el enlace del correo.
   *
   * El enlace vale una vez y una hora. Usarlo deja sin valor los demás que
   * la cuenta tuviera pendientes y cierra todas sus sesiones: si alguien
   * había entrado con la contraseña vieja, se queda fuera.
   */
  async restablecer(token: string, nueva: string): Promise<void> {
    const noValido = () =>
      new BadRequestException({
        statusCode: 400,
        codigo: CODIGO_ENLACE_NO_VALIDO,
        message:
          'El enlace no es válido o ha caducado: pide otro desde «¿Olvidaste tu contraseña?».',
      });

    await this.dataSource.transaction(async (gestor) => {
      // Con la fila bloqueada: dos pestañas con el mismo enlace no pueden
      // usarlo las dos.
      const pendiente = await gestor.findOne(RestablecimientoContrasena, {
        where: { huella: huellaDe(token) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pendiente || pendiente.usadoEn || pendiente.caduca <= new Date()) {
        throw noValido();
      }

      const usuario = await gestor.findOne(User, {
        where: { id: pendiente.userId },
      });
      if (
        !usuario ||
        !usuario.isActive ||
        usuario.eliminadaEn ||
        usuario.esDemostracion ||
        usuario.soloLectura
      ) {
        throw noValido();
      }

      await gestor.update(User, usuario.id, {
        password: await cifrar(nueva),
        sesionesDesde: segundoActual(),
      });
      await gestor.update(
        RestablecimientoContrasena,
        { userId: usuario.id, usadoEn: IsNull() },
        { usadoEn: new Date() },
      );
    });
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
      // Un identificador por sesión, para poder cerrarla en el servidor: ver
      // SesionesService.
      jwtid: randomUUID(),
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
