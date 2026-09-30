import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { CategoriesController } from './categories.controller';

/** Los cambios del catálogo quedan a nombre de quien los hace, para el historial. */
describe('CategoriesController', () => {
  const servicio = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const controlador = new CategoriesController(servicio as never);
  const peticion = {
    user: { id: 'u-1', email: 'admin@correo.test' },
  } as unknown as PeticionAutenticada;
  const quien = { id: 'u-1', email: 'admin@correo.test' };

  beforeEach(() => vi.clearAllMocks());

  it('lee el catálogo sin sesión', async () => {
    await controlador.findAll();
    await controlador.findOne('c-1');

    expect(servicio.findAll).toHaveBeenCalled();
    expect(servicio.findById).toHaveBeenCalledWith('c-1');
  });

  it('crea, cambia y borra a nombre de quien tiene la sesión', async () => {
    const datos = { name: 'Fontanería' } as never;

    await controlador.create(peticion, datos);
    await controlador.update(peticion, 'c-1', datos);
    const borrado = await controlador.remove(peticion, 'c-2');

    expect(servicio.create).toHaveBeenCalledWith(datos, quien);
    expect(servicio.update).toHaveBeenCalledWith('c-1', datos, quien);
    expect(servicio.remove).toHaveBeenCalledWith('c-2', quien);
    expect(borrado).toEqual({ message: expect.any(String) });
  });
});
