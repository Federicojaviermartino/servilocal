import type { Mock } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Conversation, Message, User } from '../entities';
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

/** Constructor de consultas encadenable, con las salidas que se le pidan. */
function qbFalso(salidas: Record<string, unknown> = {}) {
  const qb: Record<string, Mock> = {};
  for (const metodo of [
    'select',
    'addSelect',
    'where',
    'orWhere',
    'andWhere',
    'groupBy',
    'orderBy',
    'leftJoinAndSelect',
    'innerJoin',
    'update',
    'set',
  ]) {
    qb[metodo] = vi.fn(() => qb);
  }
  qb.execute = vi.fn(async () => ({ affected: 0 }));
  qb.getMany = vi.fn(async () => salidas.getMany ?? []);
  qb.getRawMany = vi.fn(async () => salidas.getRawMany ?? []);
  qb.getOne = vi.fn(async () => salidas.getOne ?? null);
  qb.getCount = vi.fn(async () => salidas.getCount ?? 0);
  return qb;
}

interface Opciones {
  /** Hilos que devuelve la lista de conversaciones. */
  hilos?: unknown[];
  /** Filas crudas del recuento de no leídos. */
  noLeidos?: unknown[];
  /** Hilo que encuentra la búsqueda entre dos personas. */
  hiloEncontrado?: unknown;
  /** Total del contador de pendientes. */
  cuenta?: number;
  /** Cuentas de demostración, desactivadas o que no existen. */
  demostracion?: string[];
  desactivadas?: string[];
  inexistentes?: string[];
}

async function construir(
  hilo: ReturnType<typeof conversacion> | null,
  opciones: Opciones = {},
) {
  const qbConversaciones = qbFalso({
    getMany: opciones.hilos ?? [],
    getOne: opciones.hiloEncontrado ?? hilo,
  });
  const qbMensajes = qbFalso({
    getRawMany: opciones.noLeidos ?? [],
    getCount: opciones.cuenta ?? 0,
  });

  const conversaciones = {
    findOne: vi.fn(async () => hilo),
    save: vi.fn(async (c: unknown) => c),
    create: vi.fn((c: unknown) => c),
    createQueryBuilder: vi.fn(() => qbConversaciones),
  };
  const mensajes = {
    create: vi.fn((m: unknown) => ({ id: 'm1', ...(m as object) })),
    save: vi.fn(async (m: unknown) => m),
    find: vi.fn(async (_opciones?: unknown) => [] as unknown[]),
    createQueryBuilder: vi.fn(() => qbMensajes),
  };
  const gateway = { notificarMensaje: vi.fn() };
  // Responde a `where: { id: In([...]) }` con cuentas activas y reales,
  // salvo lo que se le pida.
  const usuarios = {
    find: vi.fn(async (consulta: { where: { id: { value: string[] } } }) =>
      consulta.where.id.value
        .filter((id) => !(opciones.inexistentes ?? []).includes(id))
        .map((id) => ({
          id,
          isActive: !(opciones.desactivadas ?? []).includes(id),
          esDemostracion: (opciones.demostracion ?? []).includes(id),
        })),
    ),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MessagesService,
      { provide: getRepositoryToken(Conversation), useValue: conversaciones },
      { provide: getRepositoryToken(Message), useValue: mensajes },
      { provide: getRepositoryToken(User), useValue: usuarios },
      { provide: TiempoRealGateway, useValue: gateway },
    ],
  }).compile();

  return {
    servicio: module.get(MessagesService),
    conversaciones,
    mensajes,
    gateway,
    qbConversaciones,
    qbMensajes,
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
  describe('empezar una conversación', () => {
    it('reaprovecha el hilo que ya existía con esa persona', async () => {
      // Dos hilos con la misma persona partirían el historial en dos y cada
      // uno enseñaría media conversación.
      const { servicio, conversaciones } = await construir(conversacion());

      await servicio.sendMessage(YO, {
        receiverId: OTRO,
        content: 'Hola',
      } as never);

      expect(conversaciones.create).not.toHaveBeenCalled();
    });

    it('abre uno nuevo la primera vez', async () => {
      const { servicio, conversaciones } = await construir(null);

      await servicio.sendMessage(YO, {
        receiverId: OTRO,
        content: 'Hola',
      } as never);

      // objectContaining y no igualdad estricta: el servicio le añade después
      // la vista previa al mismo objeto, y vi.fn guarda la referencia.
      expect(conversaciones.create).toHaveBeenCalledWith(
        expect.objectContaining({
          participantOneId: YO,
          participantTwoId: OTRO,
        }),
      );
    });

    it('el hilo se busca en los dos sentidos', async () => {
      // Quien escribe primero queda como participante uno. Buscar solo por
      // ese lado abriría un hilo nuevo en cuanto contestara el otro.
      const { servicio, qbConversaciones } = await construir(conversacion());

      await servicio.sendMessage(YO, {
        receiverId: OTRO,
        content: 'Hola',
      } as never);

      expect(qbConversaciones.orWhere).toHaveBeenCalledWith(
        expect.stringContaining('participantOneId = :b'),
        expect.objectContaining({ a: YO, b: OTRO }),
      );
    });
  });

  describe('a quién se puede escribir', () => {
    // Se aceptaba cualquier identificador: uno que no existía daba un 500,
    // y se podía escribir a uno mismo y a una cuenta desactivada.
    it('no a uno mismo', async () => {
      const { servicio } = await construir(null);

      await expect(
        servicio.sendMessage(YO, { receiverId: YO, content: 'Hola' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['que no existe', { inexistentes: [OTRO] }],
      ['desactivada', { desactivadas: [OTRO] }],
    ])('no a una cuenta %s', async (_caso, opciones) => {
      const { servicio, mensajes } = await construir(null, opciones);

      await expect(
        servicio.sendMessage(YO, {
          receiverId: OTRO,
          content: 'Hola',
        } as never),
      ).rejects.toThrow(NotFoundException);
      expect(mensajes.save).not.toHaveBeenCalled();
    });

    it('una cuenta de demostración no escribe a una real', async () => {
      // Ver common/demostracion.ts.
      const { servicio, mensajes } = await construir(null, {
        demostracion: [YO],
      });

      await expect(
        servicio.sendMessage(YO, {
          receiverId: OTRO,
          content: 'Hola',
        } as never),
      ).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({ codigo: 'demostracion' }),
      });
      expect(mensajes.save).not.toHaveBeenCalled();
    });

    it('ni una real a una de demostración', async () => {
      const { servicio } = await construir(null, { demostracion: [OTRO] });

      await expect(
        servicio.sendMessage(YO, {
          receiverId: OTRO,
          content: 'Hola',
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('entre cuentas de demostración, sí', async () => {
      const { servicio, mensajes } = await construir(null, {
        demostracion: [YO, OTRO],
      });

      await servicio.sendMessage(YO, {
        receiverId: OTRO,
        content: 'Hola',
      } as never);

      expect(mensajes.save).toHaveBeenCalled();
    });

    it('tampoco se sigue una conversación mixta que existiera de antes', async () => {
      const { servicio, mensajes } = await construir(conversacion(), {
        demostracion: [OTRO],
      });

      await expect(
        servicio.replyToConversation(YO, HILO, { content: 'Hola' } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(mensajes.save).not.toHaveBeenCalled();
    });
  });

  describe('lista de conversaciones', () => {
    const conPersonas = () => ({
      ...conversacion(),
      lastMessagePreview: 'Buenas',
      lastMessageAt: new Date('2026-09-01T10:00:00Z'),
      participantOne: {
        id: YO,
        firstName: 'Federico',
        lastName: 'Martino',
        avatarUrl: 'a.png',
        city: 'Málaga',
        email: 'yo@ejemplo.com',
        password: 'hash-secreto',
      },
      participantTwo: {
        id: OTRO,
        firstName: 'Laura',
        lastName: 'Gil',
        avatarUrl: 'b.png',
        city: 'Sevilla',
        email: 'laura@ejemplo.com',
        password: 'hash-secreto',
      },
    });

    it('enseña al interlocutor, no a uno mismo', async () => {
      const { servicio } = await construir(null, { hilos: [conPersonas()] });

      const r = await servicio.getConversations(YO);

      expect(r[0].partnerId).toBe(OTRO);
      expect(r[0].partner.firstName).toBe('Laura');
    });

    it('y lo hace bien mirándolo desde el otro lado', async () => {
      const { servicio } = await construir(null, { hilos: [conPersonas()] });

      const r = await servicio.getConversations(OTRO);

      expect(r[0].partnerId).toBe(YO);
      expect(r[0].partner.firstName).toBe('Federico');
    });

    it('del interlocutor solo salen los campos de la interfaz', async () => {
      // La entidad completa lleva el correo y el hash de la contraseña.
      const { servicio } = await construir(null, { hilos: [conPersonas()] });

      const r = await servicio.getConversations(YO);

      expect(Object.keys(r[0].partner).sort()).toEqual([
        'avatarUrl',
        'city',
        'firstName',
        'id',
        'lastName',
      ]);
    });

    it('un hilo sin ningún mensaje no aparece en la lista', async () => {
      // Se crea al pulsar «Contactar», antes de escribir nada: enseñarlo
      // dejaría una fila con la fecha en blanco.
      const { servicio } = await construir(null, {
        hilos: [conversacion() as never],
      });

      expect(await servicio.getConversations(YO)).toEqual([]);
    });

    it('cuenta los mensajes sin leer de cada hilo', async () => {
      const { servicio } = await construir(null, {
        hilos: [conPersonas()],
        noLeidos: [{ conversationId: HILO, total: '3' }],
      });

      const r = await servicio.getConversations(YO);

      expect(r[0].unreadCount).toBe(3);
    });

    it('un hilo sin pendientes cuenta cero, no indefinido', async () => {
      const { servicio } = await construir(null, { hilos: [conPersonas()] });

      expect((await servicio.getConversations(YO))[0].unreadCount).toBe(0);
    });

    it('los propios no cuentan como pendientes', async () => {
      // Lo que uno escribe sale siempre sin leer para el otro; contarlo
      // dejaría el contador permanentemente encendido.
      const { servicio, qbMensajes } = await construir(null, {
        hilos: [conPersonas()],
      });

      await servicio.getConversations(YO);

      expect(qbMensajes.andWhere).toHaveBeenCalledWith(
        'msg.senderId != :userId',
        { userId: YO },
      );
    });
  });

  describe('abrir un hilo', () => {
    it('sin conversación previa devuelve vacío, no un error', async () => {
      // El hilo existe en la pantalla desde que se pulsa «Contactar».
      const { servicio } = await construir(null, { hiloEncontrado: null });

      expect(await servicio.findMessagesWithPartner(YO, OTRO)).toEqual([]);
    });

    it('marca como leídos los del otro, nunca los propios', async () => {
      const { servicio, qbMensajes } = await construir(null, {
        hiloEncontrado: conversacion(),
      });

      await servicio.findMessagesWithPartner(YO, OTRO);

      expect(qbMensajes.set).toHaveBeenCalledWith(
        expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      );
      expect(qbMensajes.andWhere).toHaveBeenCalledWith('senderId != :userId', {
        userId: YO,
      });
    });

    it('el hilo se lee del más antiguo al más reciente', async () => {
      const { servicio, mensajes } = await construir(null, {
        hiloEncontrado: conversacion(),
      });

      await servicio.findMessagesWithPartner(YO, OTRO);

      expect(mensajes.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'ASC' } }),
      );
    });

    it('del remitente solo se traen los campos que se pintan', async () => {
      const { servicio, mensajes } = await construir(null, {
        hiloEncontrado: conversacion(),
      });

      await servicio.findMessagesWithPartner(YO, OTRO);

      const opciones = mensajes.find.mock.calls[0][0] as unknown as {
        select: { sender: Record<string, boolean> };
      };
      expect(Object.keys(opciones.select.sender).sort()).toEqual([
        'avatarUrl',
        'firstName',
        'id',
        'lastName',
      ]);
    });
  });

  describe('contador de pendientes', () => {
    it('solo cuenta los de hilos propios y escritos por otro', async () => {
      const { servicio, qbMensajes } = await construir(null, { cuenta: 7 });

      expect(await servicio.getUnreadCount(YO)).toBe(7);
      expect(qbMensajes.andWhere).toHaveBeenCalledWith(
        'msg.senderId != :userId',
        { userId: YO },
      );
      expect(qbMensajes.andWhere).toHaveBeenCalledWith('msg.isRead = :isRead', {
        isRead: false,
      });
    });
  });
});
