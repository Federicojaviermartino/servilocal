import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Conversation, Message } from '../entities';
import { TiempoRealGateway } from '../common/tiempo-real/tiempo-real.gateway';
import { MessagesService } from './messages.service';

const YO = 'u-yo';
const OTRO = 'u-otro';
const AJENO = 'u-ajeno';
const HILO = 'c-1';

function conversacion() {
  return {
    id: HILO,
    participantOneId: YO,
    participantTwoId: OTRO,
    lastMessagePreview: null as string | null,
    lastMessageAt: null as Date | null,
  };
}

async function construir(hilo: ReturnType<typeof conversacion> | null) {
  const conversaciones = {
    findOne: jest.fn(async () => hilo),
    save: jest.fn(async (c: unknown) => c),
    create: jest.fn((c: unknown) => c),
  };
  const mensajes = {
    create: jest.fn((m: unknown) => ({ id: 'm1', ...(m as object) })),
    save: jest.fn(async (m: unknown) => m),
  };
  const gateway = { notificarMensaje: jest.fn() };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MessagesService,
      { provide: getRepositoryToken(Conversation), useValue: conversaciones },
      { provide: getRepositoryToken(Message), useValue: mensajes },
      { provide: TiempoRealGateway, useValue: gateway },
    ],
  }).compile();

  return {
    servicio: module.get(MessagesService),
    conversaciones,
    mensajes,
    gateway,
  };
}

describe('MessagesService', () => {
  describe('responder a una conversación', () => {
    it('deja escribir a quien participa', async () => {
      const { servicio, mensajes } = await construir(conversacion());

      await servicio.replyToConversation(YO, HILO, {
        content: 'Hola',
      } as never);

      expect(mensajes.save).toHaveBeenCalled();
    });

    it('deja escribir también al otro participante', async () => {
      const { servicio, mensajes } = await construir(conversacion());

      await servicio.replyToConversation(OTRO, HILO, {
        content: 'Hola',
      } as never);

      expect(mensajes.save).toHaveBeenCalled();
    });

    it('no deja escribir a un tercero', async () => {
      // Conocer el identificador de una conversación no da derecho a
      // escribir en ella; es lo único que separa un hilo privado de un foro.
      const { servicio, mensajes } = await construir(conversacion());

      await expect(
        servicio.replyToConversation(AJENO, HILO, { content: 'Hola' } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(mensajes.save).not.toHaveBeenCalled();
    });

    it('avisa si la conversación no existe', async () => {
      const { servicio } = await construir(null);

      await expect(
        servicio.replyToConversation(YO, HILO, { content: 'Hola' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('aviso por socket', () => {
    it('avisa a los dos participantes, con los identificadores guardados', async () => {
      // Los destinatarios salen de la conversación, nunca de lo que mande
      // quien escribe: si vinieran del cliente, se podría colar un mensaje
      // en la pantalla de cualquiera.
      const { servicio, gateway } = await construir(conversacion());

      await servicio.replyToConversation(YO, HILO, {
        content: 'Hola',
      } as never);

      expect(gateway.notificarMensaje).toHaveBeenCalledWith(
        [YO, OTRO],
        expect.objectContaining({ content: 'Hola' }),
      );
    });

    it('no avisa cuando la escritura se rechaza', async () => {
      const { servicio, gateway } = await construir(conversacion());

      await expect(
        servicio.replyToConversation(AJENO, HILO, { content: 'Hola' } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(gateway.notificarMensaje).not.toHaveBeenCalled();
    });
  });

  describe('vista previa de la conversación', () => {
    it('recorta los mensajes largos', async () => {
      const { servicio, conversaciones } = await construir(conversacion());
      const largo = 'a'.repeat(150);

      await servicio.replyToConversation(YO, HILO, { content: largo } as never);

      const guardada = conversaciones.save.mock.calls[0][0] as {
        lastMessagePreview: string;
      };
      expect(guardada.lastMessagePreview).toHaveLength(103);
      expect(guardada.lastMessagePreview.endsWith('...')).toBe(true);
    });

    it('deja los cortos tal cual', async () => {
      const { servicio, conversaciones } = await construir(conversacion());

      await servicio.replyToConversation(YO, HILO, {
        content: 'Corto',
      } as never);

      const guardada = conversaciones.save.mock.calls[0][0] as {
        lastMessagePreview: string;
      };
      expect(guardada.lastMessagePreview).toBe('Corto');
    });
  });
});
