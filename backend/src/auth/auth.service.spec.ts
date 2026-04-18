import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User, UserRole } from '../entities';

const mockUserRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn(() => 'mocked-jwt-token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
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

      expect(result.accessToken).toBe('mocked-jwt-token');
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

      expect(result.accessToken).toBe('mocked-jwt-token');
      expect(result.user.email).toBe(loginDto.email);
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
});
