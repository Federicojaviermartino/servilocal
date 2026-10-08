import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { RestablecimientoContrasena, User, UserRole } from '../entities';
import { AUDIENCIA_API, AUDIENCIA_SOCKET } from './sesion';
import { CorreoService } from '../correo/correo.service';
import { VERSION_TERMINOS } from '../common/cuenta';
import { TiempoRealGateway } from '../common/tiempo-real/tiempo-real.gateway';
import { FrenoDeCuentas } from '../common/redis/freno-de-cuentas';

// La comparación de verdad, pero observable: hace falta saber con qué huella
// se compara cuando el correo no existe.
vi.mock('bcrypt', async (original) => {
  const real = await original<typeof import('bcrypt')>();
  return { ...real, compare: vi.fn(real.compare) };
});

/**
 * La cuenta se busca por lower(email) con una consulta; su doble devuelve
 * lo mismo que el findOne de siempre, que es lo que preparan las pruebas.
 */
const consultaUsuario = {
  where: vi.fn().mockReturnThis(),
  addSelect: vi.fn().mockReturnThis(),
  getOne: vi.fn(async () => mockUserRepository.findOne()),
};

const mockUserRepository = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  update: vi.fn(async () => ({ affected: 1 })),
  createQueryBuilder: vi.fn(() => consultaUsuario),
};

const enlaces = {
  count: vi.fn(async () => 0),
  create: vi.fn((datos: unknown) => datos),
  save: vi.fn(async (datos: unknown) => datos),
};

const correo = {
  exigirDisponible: vi.fn(),
  enviar: vi.fn(async () => undefined),
};

const gestor = {
  findOne: vi.fn(),
  update: vi.fn(async () => ({ affected: 1 })),
};

const dataSource = {
  transaction: vi.fn(async (ejecutar: (g: typeof gestor) => Promise<unknown>) =>
    ejecutar(gestor),
  ),
};

// Un JwtService de verdad: con uno falso que devuelve una cadena fija no se
// puede comprobar para quién va firmado cada token ni cuándo caduca.
const SECRETO = 'secreto-de-prueba';
const jwt = new JwtService({
  secret: SECRETO,
  signOptions: { expiresIn: '24h' },
});

const tiempoReal = { desconectar: vi.fn() };

const freno = {
  comprobar: vi.fn(async (_correo: string) => undefined),
  anotarFallo: vi.fn(async (_correo: string) => undefined),
  olvidar: vi.fn(async (_correo: string) => undefined),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: JwtService, useValue: jwt },
        {
          provide: getRepositoryToken(RestablecimientoContrasena),
          useValue: enlaces,
        },
        { provide: CorreoService, useValue: correo },
        { provide: DataSource, useValue: dataSource },
        { provide: TiempoRealGateway, useValue: tiempoReal },
        { provide: FrenoDeCuentas, useValue: freno },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    vi.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      firstName: 'Federico',
      lastName: 'Martino',
      email: 'federico@ejemplo.com',
      password: 'Una-clave-larga-9',
      role: UserRole.CLIENT,
      aceptaTerminos: true,
    };

    it('debería registrar un usuario nuevo correctamente', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({
        id: 'uuid-123',
        ...registerDto,
        password: 'hashed',
      });
      mockUserRepository.save.mockResolvedValue({
        id: 'uuid-123',
        ...registerDto,
        password: 'hashed',
      });

      const result = await service.register(registerDto);

      expect(
        jwt.verify(result.accessToken, { audience: AUDIENCIA_API }).sub,
      ).toBe('uuid-123');
      expect(result.user.email).toBe(registerDto.email);
      expect(result.user.firstName).toBe(registerDto.firstName);
      // Sin distinguir mayúsculas: «Ana@» y «ana@» son la misma cuenta.
      expect(consultaUsuario.where).toHaveBeenCalledWith(
        'LOWER(user.email) = :email',
        { email: registerDto.email },
      );
    });

    it('deja constancia de que aceptó los términos, y de cuáles', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockImplementation((datos: unknown) => ({
        id: 'uuid-123',
        ...(datos as object),
      }));
      mockUserRepository.save.mockImplementation(async (u: unknown) => u);

      await service.register(registerDto);

      const creado = mockUserRepository.create.mock.calls[0][0];
      expect(creado.terminosAceptadosEn).toBeInstanceOf(Date);
      expect(creado.versionTerminos).toBe(VERSION_TERMINOS);
      // Y la casilla no se guarda como una columna más.
      expect(creado).not.toHaveProperty('aceptaTerminos');
      expect(await bcrypt.compare('Una-clave-larga-9', creado.password)).toBe(
        true,
      );
    });

    it.each([
      ['de las de siempre', 'Password123!'],
      ['el propio correo', 'Federico2026!'],
    ])(
      'con una contraseña que es %s no se crea la cuenta',
      async (_caso, password) => {
        // Diez intentos cada cuarto de hora dan para probar las primeras de
        // cualquier lista: esas no se admiten. «Password123!» es además la de
        // las cuentas de demostración, que está publicada.
        mockUserRepository.findOne.mockResolvedValue(null);

        const error = await service
          .register({ ...registerDto, password })
          .catch((e) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getResponse().codigo).toBe('contrasena-comun');
        expect(mockUserRepository.save).not.toHaveBeenCalled();
      },
    );

    it('debería lanzar ConflictException si el email ya existe', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 'existing-user' });

      const error = await service.register(registerDto).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      // Con código: la interfaz lo explica en el idioma de quien se registra.
      expect(error.getResponse().codigo).toBe('correo-en-uso');
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'federico@ejemplo.com',
      password: 'Password123!',
    };

    it('debería retornar token con credenciales válidas', async () => {
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: loginDto.email,
        firstName: 'Federico',
        lastName: 'Martino',
        password: hashedPassword,
        role: UserRole.CLIENT,
        isActive: true,
      });

      const result = await service.login(loginDto);

      expect(
        jwt.verify(result.accessToken, { audience: AUDIENCIA_API }).sub,
      ).toBe('uuid-123');
      expect(result.user.email).toBe(loginDto.email);
    });

    it('cada sesión lleva su propio identificador', async () => {
      // Es lo que permite cerrar una sola sesión en el servidor sin tocar
      // las demás de la misma cuenta.
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: loginDto.email,
        password: await bcrypt.hash('Password123!', 10),
        role: UserRole.CLIENT,
        isActive: true,
      });

      const una = await service.login(loginDto);
      const otra = await service.login(loginDto);
      const jti = (token: string) => jwt.decode<{ jti: string }>(token).jti;

      expect(jti(una.accessToken)).toMatch(/^[0-9a-f-]{36}$/);
      expect(jti(una.accessToken)).not.toBe(jti(otra.accessToken));
    });

    it('la cookie caduca a la vez que el token que lleva', async () => {
      // Si la cookie durara más, el navegador seguiría mandando un token
      // caducado; si durara menos, la sesión se cortaría antes de tiempo.
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: loginDto.email,
        password: await bcrypt.hash('Password123!', 10),
        role: UserRole.CLIENT,
        isActive: true,
      });

      const { accessToken, caduca } = await service.login(loginDto);
      const { exp } = jwt.decode<{ exp: number }>(accessToken);

      expect(caduca.getTime()).toBe(exp * 1000);
      expect(caduca.getTime() - Date.now()).toBeGreaterThan(23 * 3600 * 1000);
    });

    it('debería lanzar UnauthorizedException si el usuario no existe', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockClear();

      const error = await service.login(loginDto).catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse().codigo).toBe('credenciales-no-validas');
      // Se compara igual, con una huella de relleno y del mismo coste: si
      // no, la respuesta llega antes y el tiempo dice qué correos existen.
      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginDto.password,
        expect.stringMatching(/^\$2[aby]\$10\$/),
      );
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: loginDto.email,
        password: await bcrypt.hash('OtraPassword', 10),
        isActive: true,
      });

      const error = await service.login(loginDto).catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse().codigo).toBe('credenciales-no-validas');
    });

    it('debería lanzar UnauthorizedException si la cuenta está desactivada', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: loginDto.email,
        password: await bcrypt.hash('Password123!', 10),
        isActive: false,
      });

      const error = await service.login(loginDto).catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse().codigo).toBe('cuenta-desactivada');
    });

    it('una cuenta desactivada con la contraseña equivocada no dice que existe', async () => {
      // Antes se miraba si estaba activa sin comprobar la contraseña, y la
      // respuesta confirmaba el correo a cualquiera.
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: loginDto.email,
        password: await bcrypt.hash('OtraPassword', 10),
        isActive: false,
      });

      const error = await service.login(loginDto).catch((e) => e);

      expect(error.getResponse().codigo).toBe('credenciales-no-validas');
    });

    describe('el freno por cuenta', () => {
      const cuenta = async (extra: Partial<User> = {}) => ({
        id: 'uuid-123',
        email: loginDto.email,
        firstName: 'Federico',
        lastName: 'Martino',
        role: UserRole.CLIENT,
        password: await bcrypt.hash('Password123!', 4),
        isActive: true,
        ...extra,
      });
      const frenada = () =>
        new HttpException({ statusCode: 429, codigo: 'cuenta-frenada' }, 429);

      it('una contraseña equivocada se le apunta a la cuenta', async () => {
        mockUserRepository.findOne.mockResolvedValue(await cuenta());

        await service
          .login({ ...loginDto, password: 'No-es-esta1!' })
          .catch(() => undefined);

        expect(freno.anotarFallo).toHaveBeenCalledWith(loginDto.email);
        expect(freno.olvidar).not.toHaveBeenCalled();
      });

      it('y a un correo que no existe, igual: el freno no dice cuáles existen', async () => {
        mockUserRepository.findOne.mockResolvedValue(null);

        await service.login(loginDto).catch(() => undefined);

        expect(freno.comprobar).toHaveBeenCalledWith(loginDto.email);
        expect(freno.anotarFallo).toHaveBeenCalledWith(loginDto.email);
      });

      it('con el freno echado no entra ni con la buena, y ni se compara', async () => {
        // Si la contraseña buena pasara, el freno no frenaría a quien las
        // va probando.
        mockUserRepository.findOne.mockResolvedValue(await cuenta());
        freno.comprobar.mockRejectedValueOnce(frenada());
        vi.mocked(bcrypt.compare).mockClear();

        const error = await service.login(loginDto).catch((e) => e);

        expect(error.getStatus()).toBe(429);
        expect(bcrypt.compare).not.toHaveBeenCalled();
        expect(freno.anotarFallo).not.toHaveBeenCalled();
      });

      it('al entrar se empieza de cero', async () => {
        mockUserRepository.findOne.mockResolvedValue(await cuenta());

        await service.login(loginDto);

        expect(freno.olvidar).toHaveBeenCalledWith(loginDto.email);
        expect(freno.anotarFallo).not.toHaveBeenCalled();
      });

      it('una cuenta desactivada con la contraseña buena ni suma ni se olvida', async () => {
        mockUserRepository.findOne.mockResolvedValue(
          await cuenta({ isActive: false }),
        );

        await service.login(loginDto).catch(() => undefined);

        expect(freno.anotarFallo).not.toHaveBeenCalled();
        expect(freno.olvidar).not.toHaveBeenCalled();
      });

      it('las de demostración quedan fuera: ni se miran ni se apuntan', async () => {
        // Su contraseña está en la página de acceso: frenarlas sería dejar a
        // todos sin demostración a base de fallar a propósito.
        mockUserRepository.findOne.mockResolvedValue(
          await cuenta({ esDemostracion: true }),
        );

        await service
          .login({ ...loginDto, password: 'No-es-esta1!' })
          .catch(() => undefined);

        expect(freno.comprobar).not.toHaveBeenCalled();
        expect(freno.anotarFallo).not.toHaveBeenCalled();
      });
    });
  });

  describe('cambiar la contraseña', () => {
    const cuenta = async (extra: Partial<User> = {}) => ({
      id: 'uuid-123',
      email: 'federico@ejemplo.com',
      firstName: 'Federico',
      lastName: 'Martino',
      role: UserRole.CLIENT,
      password: await bcrypt.hash('Antigua123!', 4),
      ...extra,
    });

    it('y cierra los sockets abiertos: los de las sesiones que dejan de valer', async () => {
      mockUserRepository.findOne.mockResolvedValue(await cuenta());

      await service.cambiarContrasena('uuid-123', 'Antigua123!', 'Nueva12345!');

      expect(tiempoReal.desconectar).toHaveBeenCalledWith('uuid-123');
    });

    it('con la actual equivocada no se cierra nada', async () => {
      mockUserRepository.findOne.mockResolvedValue(await cuenta());

      await expect(
        service.cambiarContrasena('uuid-123', 'No-es-esta1!', 'Nueva12345!'),
      ).rejects.toThrow();
      expect(tiempoReal.desconectar).not.toHaveBeenCalled();
    });

    it('y se le apunta a la cuenta, como al entrar', async () => {
      // Con una sesión robada, esto era otra forma de probar contraseñas.
      mockUserRepository.findOne.mockResolvedValue(await cuenta());

      await service
        .cambiarContrasena('uuid-123', 'No-es-esta1!', 'Nueva12345!')
        .catch(() => undefined);

      expect(freno.anotarFallo).toHaveBeenCalledWith('federico@ejemplo.com');
    });

    it('con el freno echado no se llega a comparar ni se cambia nada', async () => {
      mockUserRepository.findOne.mockResolvedValue(await cuenta());
      freno.comprobar.mockRejectedValueOnce(
        new HttpException({ statusCode: 429, codigo: 'cuenta-frenada' }, 429),
      );
      vi.mocked(bcrypt.compare).mockClear();

      const error = await service
        .cambiarContrasena('uuid-123', 'Antigua123!', 'Nueva12345!')
        .catch((e) => e);

      expect(error.getStatus()).toBe(429);
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('la nueva no puede ser de las de siempre', async () => {
      mockUserRepository.findOne.mockResolvedValue(await cuenta());

      const error = await service
        .cambiarContrasena('uuid-123', 'Antigua123!', 'Password123!')
        .catch((e) => e);

      expect(error.getResponse().codigo).toBe('contrasena-comun');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
      expect(tiempoReal.desconectar).not.toHaveBeenCalled();
    });

    it('al cambiarla, la cuenta empieza de cero', async () => {
      mockUserRepository.findOne.mockResolvedValue(await cuenta());

      await service.cambiarContrasena('uuid-123', 'Antigua123!', 'Nueva12345!');

      expect(freno.olvidar).toHaveBeenCalledWith('federico@ejemplo.com');
    });

    it('con la actual, pone la nueva y cierra las demás sesiones', async () => {
      mockUserRepository.findOne.mockResolvedValue(await cuenta());

      const sesion = await service.cambiarContrasena(
        'uuid-123',
        'Antigua123!',
        'Nueva12345!',
      );

      const [id, cambios] = mockUserRepository.update.mock
        .calls[0] as unknown as [
        string,
        { password: string; sesionesDesde: Date },
      ];
      expect(id).toBe('uuid-123');
      expect(await bcrypt.compare('Nueva12345!', cambios.password)).toBe(true);
      // La sesión de quien la cambia sigue: su token nuevo no es anterior
      // al cambio, y los de antes sí lo son.
      const { iat } = jwt.decode<{ iat: number }>(sesion.accessToken);
      expect(iat * 1000).toBeGreaterThanOrEqual(
        cambios.sesionesDesde.getTime(),
      );
      expect(cambios.sesionesDesde.getTime() % 1000).toBe(0);
    });

    it('sin la actual correcta, 400 con su código y nada cambia', async () => {
      // 400 y no 401: la interfaz trata un 401 como sesión caducada.
      mockUserRepository.findOne.mockResolvedValue(await cuenta());

      const error = await service
        .cambiarContrasena('uuid-123', 'NoEsEsta1!', 'Nueva12345!')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: 'contrasena-incorrecta',
      });
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('una cuenta de demostración no la cambia: la comparten todos', async () => {
      mockUserRepository.findOne.mockResolvedValue(
        await cuenta({ esDemostracion: true }),
      );

      const error = await service
        .cambiarContrasena('uuid-123', 'Antigua123!', 'Nueva12345!')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        codigo: 'cuenta-de-demostracion',
      });
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('recuperar la contraseña por correo', () => {
    const cuenta = (extra: Partial<User> = {}) => ({
      id: 'uuid-123',
      email: 'ana@ejemplo.org',
      firstName: 'Ana',
      isActive: true,
      esDemostracion: false,
      soloLectura: false,
      eliminadaEn: null,
      ...extra,
    });

    /** El enlace que salió en el correo, y su token. */
    const enlaceEnviado = () => {
      const [mensaje] = correo.enviar.mock.calls[0] as unknown as [
        { texto: string; para: { email: string } },
      ];
      const enlace = /https?:\/\/\S+restablecer\?token=(\S+)/.exec(
        mensaje.texto,
      )!;
      return { mensaje, enlace: enlace[0], token: enlace[1] };
    };

    it('manda un enlace que vale una hora, y guarda solo su huella', async () => {
      mockUserRepository.findOne.mockResolvedValue(cuenta());

      await service.solicitarRecuperacion('ana@ejemplo.org', 'es');

      const { mensaje, token } = enlaceEnviado();
      expect(mensaje.para.email).toBe('ana@ejemplo.org');
      const guardado = enlaces.save.mock.calls[0][0] as {
        huella: string;
        caduca: Date;
      };
      // Con una copia de la base no se puede usar ningún enlace.
      expect(guardado.huella).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(JSON.stringify(guardado)).not.toContain(token);
      const minutos = (guardado.caduca.getTime() - Date.now()) / 60_000;
      expect(minutos).toBeGreaterThan(59);
      expect(minutos).toBeLessThanOrEqual(60);
    });

    it('en el idioma de quien lo pidió, y el enlace lleva su prefijo', async () => {
      mockUserRepository.findOne.mockResolvedValue(cuenta());

      await service.solicitarRecuperacion('ana@ejemplo.org', 'en');

      const { mensaje, enlace } = enlaceEnviado();
      expect(enlace).toContain('/en/auth/restablecer?token=');
      expect((mensaje as unknown as { asunto: string }).asunto).toBe(
        'Choose a new password on ServiLocal',
      );
    });

    it.each([
      ['una cuenta que no existe', null],
      ['una desactivada', { isActive: false }],
      ['una de demostración', { esDemostracion: true }],
      ['una eliminada', { eliminadaEn: new Date() }],
    ])('con %s responde igual y no manda nada', async (_caso, extra) => {
      // Responder distinto diría quién está registrado.
      mockUserRepository.findOne.mockResolvedValue(
        extra === null ? null : cuenta(extra as Partial<User>),
      );

      await expect(
        service.solicitarRecuperacion('ana@ejemplo.org'),
      ).resolves.toBeUndefined();
      expect(correo.enviar).not.toHaveBeenCalled();
      expect(enlaces.save).not.toHaveBeenCalled();
    });

    it('a una cuenta no le llegan más de tres por hora', async () => {
      // Desde muchas direcciones, el límite por visitante no lo impide.
      mockUserRepository.findOne.mockResolvedValue(cuenta());
      enlaces.count.mockResolvedValueOnce(3);

      await service.solicitarRecuperacion('ana@ejemplo.org');

      expect(correo.enviar).not.toHaveBeenCalled();
    });

    it('si el envío falla, no se cuenta: responde igual', async () => {
      mockUserRepository.findOne.mockResolvedValue(cuenta());
      correo.enviar.mockRejectedValueOnce(new Error('Brevo respondió 500'));

      await expect(
        service.solicitarRecuperacion('ana@ejemplo.org'),
      ).resolves.toBeUndefined();
    });

    it('sin correo configurado, lo dice antes de mirar nada', async () => {
      correo.exigirDisponible.mockImplementationOnce(() => {
        throw new ServiceUnavailableException();
      });

      // Al momento, no en la tarea: es lo único que la ruta espera.
      expect(() => service.solicitarRecuperacion('ana@ejemplo.org')).toThrow(
        ServiceUnavailableException,
      );
      expect(mockUserRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('si algo falla antes del envío, se anota y la tarea no falla', async () => {
      // La ruta no la espera: un rechazo sin atender tumbaría el proceso.
      mockUserRepository.findOne.mockResolvedValue(cuenta());
      enlaces.save.mockRejectedValueOnce(new Error('la base no responde'));

      await expect(
        service.solicitarRecuperacion('ana@ejemplo.org'),
      ).resolves.toBeUndefined();
      expect(correo.enviar).not.toHaveBeenCalled();
    });

    it('el correo no lleva el nombre de la cuenta', async () => {
      // El correo no se verifica al registrarse: el nombre pudo escribirlo
      // otra persona, y era texto suyo en un correo auténtico.
      mockUserRepository.findOne.mockResolvedValue(
        cuenta({ firstName: 'Llama ya al 600 000 000' }),
      );

      await service.solicitarRecuperacion('ana@ejemplo.org', 'es');

      const { mensaje } = enlaceEnviado();
      expect(mensaje.para).toEqual({ email: 'ana@ejemplo.org' });
      expect(JSON.stringify(mensaje)).not.toContain('600 000 000');
    });
  });

  describe('poner la contraseña nueva con el enlace', () => {
    const TOKEN = 'x'.repeat(43);
    const pendiente = (extra = {}) => ({
      id: 'e1',
      userId: 'uuid-123',
      huella: createHash('sha256').update(TOKEN).digest('hex'),
      caduca: new Date(Date.now() + 30 * 60_000),
      usadoEn: null,
      ...extra,
    });
    const usuario = (extra = {}) => ({
      id: 'uuid-123',
      email: 'federico@ejemplo.com',
      isActive: true,
      esDemostracion: false,
      soloLectura: false,
      eliminadaEn: null,
      ...extra,
    });
    const preparar = (enlace: unknown, cuenta: unknown = usuario()) =>
      gestor.findOne.mockImplementation(async (entidad: unknown) =>
        entidad === RestablecimientoContrasena ? enlace : cuenta,
      );

    it('y cierra los sockets que la cuenta tuviera abiertos', async () => {
      // Quien hubiera entrado con la contraseña vieja se queda fuera de la
      // API, y también del tiempo real.
      preparar(pendiente());

      await service.restablecer(TOKEN, 'Nueva12345!');

      expect(tiempoReal.desconectar).toHaveBeenCalledWith('uuid-123');
    });

    it('con un enlace que no vale, no se cierra nada', async () => {
      preparar(null);

      await expect(service.restablecer(TOKEN, 'Nueva12345!')).rejects.toThrow();
      expect(tiempoReal.desconectar).not.toHaveBeenCalled();
      expect(freno.olvidar).not.toHaveBeenCalled();
    });

    it('con una de las de siempre no se pone, y el enlace sigue valiendo', async () => {
      preparar(pendiente());

      const error = await service
        .restablecer(TOKEN, 'Welcome2026!')
        .catch((e) => e);

      expect(error.getResponse().codigo).toBe('contrasena-comun');
      // Ni la contraseña ni el enlace: se puede probar con otra.
      expect(gestor.update).not.toHaveBeenCalled();
    });

    it('y suelta el freno: quien la recupera no espera a que caduque', async () => {
      preparar(pendiente());

      await service.restablecer(TOKEN, 'Nueva12345!');

      expect(freno.olvidar).toHaveBeenCalledWith('federico@ejemplo.com');
    });

    it('pone la contraseña, cierra las sesiones y gasta todos los enlaces', async () => {
      preparar(pendiente());

      await service.restablecer(TOKEN, 'Nueva12345!');

      const [entidad, id, cambios] = gestor.update.mock.calls[0] as unknown as [
        unknown,
        string,
        { password: string; sesionesDesde: Date },
      ];
      expect(entidad).toBe(User);
      expect(id).toBe('uuid-123');
      expect(await bcrypt.compare('Nueva12345!', cambios.password)).toBe(true);
      expect(cambios.sesionesDesde).toBeInstanceOf(Date);
      expect(gestor.update).toHaveBeenCalledWith(
        RestablecimientoContrasena,
        { userId: 'uuid-123', usadoEn: IsNull() },
        { usadoEn: expect.any(Date) },
      );
    });

    it('el enlace se busca por su huella, con la fila bloqueada', async () => {
      // Dos pestañas con el mismo enlace no pueden usarlo las dos.
      preparar(pendiente());

      await service.restablecer(TOKEN, 'Nueva12345!');

      expect(gestor.findOne).toHaveBeenCalledWith(RestablecimientoContrasena, {
        where: { huella: pendiente().huella },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it.each([
      ['que no existe', null, usuario()],
      ['ya usado', pendiente({ usadoEn: new Date() }), usuario()],
      [
        'caducado',
        pendiente({ caduca: new Date(Date.now() - 1000) }),
        usuario(),
      ],
      [
        'de una cuenta de demostración',
        pendiente(),
        usuario({ esDemostracion: true }),
      ],
      [
        'de una cuenta eliminada',
        pendiente(),
        usuario({ eliminadaEn: new Date() }),
      ],
    ])('un enlace %s no vale', async (_caso, enlace, cuenta) => {
      preparar(enlace, cuenta);

      const error = await service
        .restablecer(TOKEN, 'Nueva12345!')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: 'enlace-no-valido',
      });
      expect(gestor.update).not.toHaveBeenCalled();
    });
  });

  describe('ticketDeSocket', () => {
    it('sirve para el socket y dura un minuto', () => {
      const pase = service.ticketDeSocket('uuid-123');
      const carga = jwt.verify<{ sub: string; exp: number; iat: number }>(
        pase,
        { audience: AUDIENCIA_SOCKET },
      );

      expect(carga.sub).toBe('uuid-123');
      expect(carga.exp - carga.iat).toBe(60);
    });

    it('no vale como sesión', () => {
      // Es lo que el navegador ve, así que no puede abrir nada más que el
      // socket: sacarlo de la página no daría acceso a la API.
      const pase = service.ticketDeSocket('uuid-123');

      expect(() => jwt.verify(pase, { audience: AUDIENCIA_API })).toThrow(
        /audience/,
      );
    });

    it('y la sesión no vale como pase', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: 'federico@ejemplo.com',
        password: await bcrypt.hash('Password123!', 10),
        role: UserRole.CLIENT,
        isActive: true,
      });
      const { accessToken } = await service.login({
        email: 'federico@ejemplo.com',
        password: 'Password123!',
      });

      expect(() =>
        jwt.verify(accessToken, { audience: AUDIENCIA_SOCKET }),
      ).toThrow(/audience/);
    });
  });
});
