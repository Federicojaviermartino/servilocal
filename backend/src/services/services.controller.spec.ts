import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { UserRole } from '../entities';
import { ServicesController } from './services.controller';

describe('ServicesController', () => {
  const servicio = {
    search: vi.fn(),
    findByProvider: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const controlador = new ServicesController(servicio as never);
  const peticion = {
    user: { id: 'u-1', role: UserRole.PROVIDER },
  } as unknown as PeticionAutenticada;
  const conDireccion = {
    id: 's-1',
    title: 'Fontanería urgente',
    address: 'Calle Mayor 3',
    location: { type: 'Point', coordinates: [-3.7, 40.4] },
  };

  beforeEach(() => vi.clearAllMocks());

  it('busca con los filtros tal como llegan', async () => {
    const filtros = { city: 'Madrid' } as never;

    await controlador.search(filtros);

    expect(servicio.search).toHaveBeenCalledWith(filtros);
  });

  it('la ficha pública no lleva la dirección de referencia', async () => {
    // Es la de casa de muchos autónomos: solo la ve su dueño, en «mine».
    servicio.findById.mockResolvedValueOnce(conDireccion);

    const ficha = await controlador.findOne('s-1');

    expect(servicio.findById).toHaveBeenCalledWith('s-1', { publica: true });
    expect(ficha).not.toHaveProperty('address');
    expect(ficha).toMatchObject({ id: 's-1', title: 'Fontanería urgente' });
  });

  it('los de un profesional, vistos por otros, tampoco', async () => {
    servicio.findByProvider.mockResolvedValueOnce([conDireccion]);

    const lista = await controlador.findByProvider('p-1');

    expect(servicio.findByProvider).toHaveBeenCalledWith('p-1');
    expect(lista[0]).not.toHaveProperty('address');
  });

  it('los propios sí, y son los de quien tiene la sesión', async () => {
    servicio.findByProvider.mockResolvedValueOnce([conDireccion]);

    const propios = await controlador.findMine(peticion);

    expect(servicio.findByProvider).toHaveBeenCalledWith('u-1');
    expect(propios[0]).toHaveProperty('address', 'Calle Mayor 3');
  });

  it('publica, cambia y retira como quien tiene la sesión', async () => {
    const datos = { title: 'Fontanería' } as never;

    await controlador.create(peticion, datos);
    await controlador.update('s-1', peticion, datos);
    const retirado = await controlador.remove('s-2', peticion);

    expect(servicio.create).toHaveBeenCalledWith('u-1', datos);
    expect(servicio.update).toHaveBeenCalledWith('s-1', 'u-1', datos);
    // Con el rol: la administración también puede retirar uno ajeno.
    expect(servicio.remove).toHaveBeenCalledWith(
      's-2',
      'u-1',
      UserRole.PROVIDER,
    );
    expect(retirado).toEqual({ message: expect.any(String) });
  });
});
