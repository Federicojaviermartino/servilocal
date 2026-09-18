import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../entities';
import { UsersService } from './users.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('UsersService', () => {
  let servicio: UsersService;
  let repo: { findOne: jest.Mock; save: jest.Mock; find: jest.Mock };
  const auditoria = { anotar: jest.fn(async () => undefined) };

  const OTRO = 'b2c3d4e5-0000-4000-8000-000000000002';
  const YO = 'a1b2c3d4-0000-4000-8000-000000000001';
  const ACTOR = { id: YO, email: 'admin@servilocal.com' };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(async () => ({ id: OTRO, isActive: true }) as User),
      save: jest.fn(async (u: User) => u),
      find: jest.fn(async (_o?: unknown) => [] as User[]),
    };
    auditoria.anotar.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: AuditoriaService, useValue: auditoria },
      ],
    }).compile();

    servicio = module.get(UsersService);
  });

  describe('toggleActive', () => {
    it('cambia el estado de otra cuenta', async () => {
      const resultado = await servicio.toggleActive(OTRO, ACTOR);

      expect(resultado.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalled();
    });

    it('no deja que un administrador se desactive a sí mismo', async () => {
      // Sería irreversible: la estrategia JWT rechaza a los inactivos y la
      // ruta exige un administrador activo, así que con un solo administrador
      // no queda nadie que pueda deshacerlo desde la aplicación.
      await expect(servicio.toggleActive(YO, ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('sigue avisando si la cuenta no existe', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(servicio.toggleActive(OTRO, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
  describe('lo que sale de un listado de usuarios', () => {
    it('no se pide la contraseña ni la ubicación', async () => {
      // El listado lo ve administración, pero la columna de contraseña no
      // tiene por qué salir de la base de datos ni para eso.
      await servicio.findAll();

      const opciones = repo.find.mock.calls[0][0] as { select: string[] };
      expect(opciones.select).toContain('email');
      expect(opciones.select).not.toContain('password');
      expect(opciones.select).not.toContain('location');
    });
  });

  describe('editar el perfil', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue({
        id: OTRO,
        isActive: true,
        city: 'Málaga',
        location: 'punto-original',
      } as unknown as User);
    });

    it('el punto lleva la longitud delante de la latitud', async () => {
      // POINT toma (x, y), o sea (longitud, latitud). Invertirlo compila
      // igual y coloca a la persona en el hemisferio equivocado.
      const r = await servicio.update(OTRO, {
        latitude: 36.72,
        longitude: -4.42,
      } as never);

      expect(r.location).toBe('SRID=4326;POINT(-4.42 36.72)');
    });

    it('sin las dos coordenadas no se toca la ubicación', async () => {
      // Una posición a medias es peor que ninguna: dejaría a la persona en
      // el meridiano cero.
      const r = await servicio.update(OTRO, { latitude: 36.72 } as never);

      expect(r.location).toBe('punto-original');
    });

    it('la latitud y la longitud no se copian como campos sueltos', async () => {
      // No son columnas de la entidad: asignarlas ensuciaría la fila con dos
      // campos que TypeORM no sabe guardar.
      const r = (await servicio.update(OTRO, {
        city: 'Sevilla',
        latitude: 36.72,
        longitude: -4.42,
      } as never)) as unknown as Record<string, unknown>;

      expect(r.city).toBe('Sevilla');
      expect(r.latitude).toBeUndefined();
      expect(r.longitude).toBeUndefined();
    });

    it('avisa si la cuenta no existe', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(
        servicio.update(OTRO, { city: 'Sevilla' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('lo que queda anotado al cambiar el estado de una cuenta', () => {
    it('desactivar y activar se distinguen en el historial', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: OTRO,
        isActive: true,
        email: 'laura@ejemplo.com',
      } as User);

      await servicio.toggleActive(OTRO, ACTOR);

      expect(auditoria.anotar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'usuario_desactivado',
          entidadId: OTRO,
          contexto: { email: 'laura@ejemplo.com' },
        }),
      );
    });

    it('reactivar queda con su propia acción', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: OTRO,
        isActive: false,
        email: 'laura@ejemplo.com',
      } as User);

      await servicio.toggleActive(OTRO, ACTOR);

      expect(auditoria.anotar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'usuario_activado' }),
      );
    });

    it('el intento bloqueado no deja anotación', async () => {
      // Solo se anota lo que llegó a ocurrir; si no, el historial se llena
      // de acciones que nadie hizo.
      await expect(servicio.toggleActive(YO, ACTOR)).rejects.toThrow(
        BadRequestException,
      );

      expect(auditoria.anotar).not.toHaveBeenCalled();
    });
  });
});
