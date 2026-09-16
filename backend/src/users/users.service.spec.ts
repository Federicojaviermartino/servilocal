import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../entities';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let servicio: UsersService;
  let repo: { findOne: jest.Mock; save: jest.Mock };

  const OTRO = 'b2c3d4e5-0000-4000-8000-000000000002';
  const YO = 'a1b2c3d4-0000-4000-8000-000000000001';

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(async () => ({ id: OTRO, isActive: true }) as User),
      save: jest.fn(async (u: User) => u),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    servicio = module.get(UsersService);
  });

  describe('toggleActive', () => {
    it('cambia el estado de otra cuenta', async () => {
      const resultado = await servicio.toggleActive(OTRO, YO);

      expect(resultado.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalled();
    });

    it('no deja que un administrador se desactive a sí mismo', async () => {
      // Sería irreversible: la estrategia JWT rechaza a los inactivos y la
      // ruta exige un administrador activo, así que con un solo administrador
      // no queda nadie que pueda deshacerlo desde la aplicación.
      await expect(servicio.toggleActive(YO, YO)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('sigue avisando si la cuenta no existe', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(servicio.toggleActive(OTRO, YO)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
