import { Test, TestingModule } from '@nestjs/testing';
import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { UserRole } from '../entities';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';

describe('AuditoriaController', () => {
  let controlador: AuditoriaController;
  const auditoria = { listar: vi.fn(async () => ({ datos: [] })) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditoriaController],
      providers: [{ provide: AuditoriaService, useValue: auditoria }],
    }).compile();

    controlador = module.get(AuditoriaController);
    auditoria.listar.mockClear();
  });

  const quien = (soloLectura: boolean) =>
    ({ user: { id: 'u-1', soloLectura } }) as unknown as PeticionAutenticada;

  it('pide la página que se le indica', async () => {
    await controlador.listar(3, quien(false));

    expect(auditoria.listar).toHaveBeenCalledWith(3, {
      soloDemostracion: false,
    });
  });

  it('a la administración de demostración no le enseña la moderación real', async () => {
    await controlador.listar(1, quien(true));

    expect(auditoria.listar).toHaveBeenCalledWith(1, {
      soloDemostracion: true,
    });
  });

  it('está reservado al administrador', () => {
    // El historial dice quién moderó qué. Dejarlo a la vista de cualquiera
    // convertiría la moderación en información pública sobre terceros.
    const roles = Reflect.getMetadata('roles', AuditoriaController);

    expect(roles).toEqual([UserRole.ADMIN]);
  });

  it('no expone ninguna ruta más que la de consulta', () => {
    // Si alguien añadiera un borrado, el historial dejaría de probar nada.
    // Esta comprobación lo caza antes de que llegue a desplegarse.
    const metodos = Object.getOwnPropertyNames(
      AuditoriaController.prototype,
    ).filter((m) => m !== 'constructor');

    expect(metodos).toEqual(['listar']);
  });
});
