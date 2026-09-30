import type { PeticionAutenticada } from '../auth/peticion-autenticada';
import { MessagesController } from './messages.controller';

/**
 * Quién escribe y quién lee sale de la sesión: ver
 * bookings.controller.spec.ts.
 */
describe('MessagesController', () => {
  const servicio = {
    sendMessage: vi.fn(),
    replyToConversation: vi.fn(),
    getConversations: vi.fn(),
    findMessagesWithPartner: vi.fn(),
    marcarLeidos: vi.fn(),
    getUnreadCount: vi.fn(async () => 3),
  };
  const controlador = new MessagesController(servicio as never);
  const peticion = { user: { id: 'u-1' } } as unknown as PeticionAutenticada;

  beforeEach(() => vi.clearAllMocks());

  it('envía y responde como quien tiene la sesión', async () => {
    const mensaje = { receiverId: 'u-2', content: 'Hola' } as never;
    const respuesta = { content: 'Hola' } as never;

    await controlador.send(peticion, mensaje);
    await controlador.reply(peticion, 'c-1', respuesta);

    expect(servicio.sendMessage).toHaveBeenCalledWith('u-1', mensaje);
    expect(servicio.replyToConversation).toHaveBeenCalledWith(
      'u-1',
      'c-1',
      respuesta,
    );
  });

  it('solo lee las conversaciones propias', async () => {
    await controlador.getConversations(peticion);
    await controlador.getMessages(peticion, 'u-2');
    await controlador.marcarLeidos(peticion, 'u-2');

    expect(servicio.getConversations).toHaveBeenCalledWith('u-1');
    expect(servicio.findMessagesWithPartner).toHaveBeenCalledWith('u-1', 'u-2');
    expect(servicio.marcarLeidos).toHaveBeenCalledWith('u-1', 'u-2');
  });

  it('devuelve los no leídos con el nombre que espera la web', async () => {
    await expect(controlador.getUnreadCount(peticion)).resolves.toEqual({
      unreadCount: 3,
    });
  });
});
