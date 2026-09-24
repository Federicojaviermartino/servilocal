import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User, UserRole } from '../entities';
import { AUDIENCIA_API, AUDIENCIA_SOCKET } from './sesion';

const mockUserRepository = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
};

// Un JwtService de verdad: con uno falso que devuelve una cadena fija no se
// puede comprobar para quién va firmado cada token ni cuándo caduca.
const SECRETO = 'secreto-de-prueba';
const jwt = new JwtService({
  secret: SECRETO,
  signOptions: { expiresIn: '24h' },
});

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: JwtService, useValue: jwt },
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
      password: 'Password123!',
      role: UserRole.CLIENT,
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
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
    });

    it('debería lanzar ConflictException si el email ya existe', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 'existing-user' });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
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

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: loginDto.email,
        password: await bcrypt.hash('OtraPassword', 10),
        isActive: true,
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería lanzar UnauthorizedException si la cuenta está desactivada', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'uuid-123',
        email: loginDto.email,
        password: await bcrypt.hash('Password123!', 10),
        isActive: false,
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
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
