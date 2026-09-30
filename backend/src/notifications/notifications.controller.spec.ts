import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { NotificationsController } from './notifications.controller';

/** Los avisos de quien tiene la sesión, y de nadie más. */
describe('NotificationsController', () => {
  const servicio = {
    listar: vi.fn(),
    sinLeer: vi.fn(async () => 2),
    marcarLeido: vi.fn(),
    marcarTodosLeidos: vi.fn(),
  };
  const controlador = new NotificationsController(servicio as never);
  const peticion = { user: { id: 'u-1' } } as unknown as PeticionAutenticada;

  beforeEach(() => vi.clearAllMocks());

  it('lista y cuenta los avisos propios', async () => {
    await controlador.listar(peticion);

    expect(servicio.listar).toHaveBeenCalledWith('u-1');
    await expect(controlador.sinLeer(peticion)).resolves.toEqual({ total: 2 });
  });

  it('marca un aviso comprobando de quién es', async () => {
    await controlador.marcarLeido(peticion, 'a-1');

    expect(servicio.marcarLeido).toHaveBeenCalledWith('a-1', 'u-1');
  });

  it('marcar todos solo toca los propios', async () => {
    await controlador.marcarTodos(peticion);

    expect(servicio.marcarTodosLeidos).toHaveBeenCalledWith('u-1');
  });
});
