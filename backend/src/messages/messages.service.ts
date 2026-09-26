import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Conversation, Message, User } from '../entities';
import { comprobarMismoMundo } from '../common/demostracion';
import { SendMessageDto, ReplyMessageDto } from './dto/message.dto';
import { TiempoRealGateway } from '../common/tiempo-real/tiempo-real.gateway';

export interface ResumenConversacion {
  partnerId: string;
  partner: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string;
    city: string;
  };
  lastMessage: {
    content: string;
    createdAt: Date;
  };
  unreadCount: number;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly gateway: TiempoRealGateway,
  ) {}

  /**
   * Las dos personas de una conversación, comprobadas.
   *
   * Se aceptaba cualquier destinatario: un identificador que no existía daba
   * un 500, se podía escribir a uno mismo y a una cuenta desactivada. Y las
   * cuentas de demostración escribían a las reales: ver
   * common/demostracion.ts.
   */
  private async comprobarPareja(
    remitenteId: string,
    destinatarioId: string,
  ): Promise<void> {
    if (remitenteId === destinatarioId) {
      throw new BadRequestException('No puedes escribirte a ti mismo');
    }

    const personas = await this.userRepository.find({
      where: { id: In([remitenteId, destinatarioId]) },
      select: { id: true, isActive: true, esDemostracion: true },
    });
    const remitente = personas.find((p) => p.id === remitenteId);
    const destinatario = personas.find((p) => p.id === destinatarioId);
    if (!remitente || !destinatario?.isActive) {
      throw new NotFoundException('Destinatario no encontrado');
    }
    comprobarMismoMundo(remitente, destinatario);
  }

  /**
   * Avisa por socket a quien esté mirando.
   *
   * Va aquí y no en el controlador porque hay dos caminos que guardan un
   * mensaje: acordarse en uno y olvidarlo en el otro daría una mensajería
   * que funciona a veces, que es peor que una que no funciona nunca.
   *
   * Los destinatarios salen de la conversación guardada, jamás de lo que
   * mande el cliente.
   */
  private avisar(conversacion: Conversation, mensaje: Message): void {
    this.gateway.notificarMensaje(
      [conversacion.participantOneId, conversacion.participantTwoId],
      mensaje,
    );
  }

  async sendMessage(senderId: string, dto: SendMessageDto): Promise<Message> {
    await this.comprobarPareja(senderId, dto.receiverId);

    const conversation = await this.findOrCreateConversation(
      senderId,
      dto.receiverId,
    );

    const message = this.messageRepository.create({
      conversationId: conversation.id,
      senderId,
      content: dto.content,
    });

    const savedMessage = await this.messageRepository.save(message);

    conversation.lastMessagePreview =
      dto.content.length > 100
        ? dto.content.substring(0, 100) + '...'
        : dto.content;
    conversation.lastMessageAt = new Date();
    await this.conversationRepository.save(conversation);

    this.avisar(conversation, savedMessage);

    return savedMessage;
  }

  async replyToConversation(
    senderId: string,
    conversationId: string,
    dto: ReplyMessageDto,
  ): Promise<Message> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }

    if (
      conversation.participantOneId !== senderId &&
      conversation.participantTwoId !== senderId
    ) {
      throw new ForbiddenException('No perteneces a esta conversación');
    }

    // También al responder: una conversación entre una cuenta de
    // demostración y una real que existiera de antes no debe seguir viva.
    await this.comprobarPareja(
      senderId,
      conversation.participantOneId === senderId
        ? conversation.participantTwoId
        : conversation.participantOneId,
    );

    const message = this.messageRepository.create({
      conversationId,
      senderId,
      content: dto.content,
    });

    const savedMessage = await this.messageRepository.save(message);

    conversation.lastMessagePreview =
      dto.content.length > 100
        ? dto.content.substring(0, 100) + '...'
        : dto.content;
    conversation.lastMessageAt = new Date();
    await this.conversationRepository.save(conversation);

    this.avisar(conversation, savedMessage);

    return savedMessage;
  }

  async getConversations(userId: string): Promise<ResumenConversacion[]> {
    const conversaciones = await this.conversationRepository
      .createQueryBuilder('conv')
      .leftJoinAndSelect('conv.participantOne', 'p1')
      .leftJoinAndSelect('conv.participantTwo', 'p2')
      .where('conv.participantOneId = :userId', { userId })
      .orWhere('conv.participantTwoId = :userId', { userId })
      .orderBy('conv.lastMessageAt', 'DESC')
      .getMany();

    // Una conversación sin ningún mensaje no tiene nada que mostrar y
    // dejaría la fecha del último mensaje a null en el cliente.
    const conIntercambio = conversaciones.filter((conv) => conv.lastMessageAt);
    if (conIntercambio.length === 0) return [];

    const noLeidos = await this.messageRepository
      .createQueryBuilder('msg')
      .select('msg.conversationId', 'conversationId')
      .addSelect('COUNT(*)', 'total')
      .where('msg.conversationId IN (:...ids)', {
        ids: conIntercambio.map((conv) => conv.id),
      })
      .andWhere('msg.senderId != :userId', { userId })
      .andWhere('msg.isRead = false')
      .groupBy('msg.conversationId')
      .getRawMany();

    const noLeidosPorConversacion = new Map<string, number>(
      noLeidos.map((fila) => [fila.conversationId, Number(fila.total)]),
    );

    return conIntercambio.map((conv) => {
      const interlocutor =
        conv.participantOneId === userId
          ? conv.participantTwo
          : conv.participantOne;

      return {
        partnerId: interlocutor.id,
        // Se exponen solo los campos que necesita la interfaz: la entidad
        // completa incluye el hash de la contraseña del participante.
        partner: {
          id: interlocutor.id,
          firstName: interlocutor.firstName,
          lastName: interlocutor.lastName,
          avatarUrl: interlocutor.avatarUrl,
          city: interlocutor.city,
        },
        lastMessage: {
          content: conv.lastMessagePreview,
          createdAt: conv.lastMessageAt,
        },
        unreadCount: noLeidosPorConversacion.get(conv.id) ?? 0,
      };
    });
  }

  async findMessagesWithPartner(
    userId: string,
    partnerId: string,
  ): Promise<Message[]> {
    const conversation = await this.findConversationBetween(userId, partnerId);

    // El hilo existe en la interfaz desde que se pulsa "Contactar", antes de
    // que nadie haya escrito. Devolver vacío es correcto; un 404 no lo sería.
    if (!conversation) return [];

    await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({ isRead: true, readAt: new Date() })
      .where('conversationId = :conversationId', {
        conversationId: conversation.id,
      })
      .andWhere('senderId != :userId', { userId })
      .andWhere('isRead = false')
      .execute();

    return this.messageRepository.find({
      where: { conversationId: conversation.id },
      relations: { sender: true },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        content: true,
        isRead: true,
        readAt: true,
        createdAt: true,
        sender: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
      order: { createdAt: 'ASC' },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.messageRepository
      .createQueryBuilder('msg')
      .innerJoin('msg.conversation', 'conv')
      .where(
        '(conv.participantOneId = :userId OR conv.participantTwoId = :userId)',
        { userId },
      )
      .andWhere('msg.senderId != :userId', { userId })
      .andWhere('msg.isRead = :isRead', { isRead: false })
      .getCount();
  }

  private async findConversationBetween(
    userOneId: string,
    userTwoId: string,
  ): Promise<Conversation | null> {
    return this.conversationRepository
      .createQueryBuilder('conv')
      .where('(conv.participantOneId = :a AND conv.participantTwoId = :b)', {
        a: userOneId,
        b: userTwoId,
      })
      .orWhere('(conv.participantOneId = :b AND conv.participantTwoId = :a)', {
        a: userOneId,
        b: userTwoId,
      })
      .getOne();
  }

  private async findOrCreateConversation(
    userOneId: string,
    userTwoId: string,
  ): Promise<Conversation> {
    const existing = await this.findConversationBetween(userOneId, userTwoId);

    if (existing) return existing;

    const conversation = this.conversationRepository.create({
      participantOneId: userOneId,
      participantTwoId: userTwoId,
    });

    return this.conversationRepository.save(conversation);
  }
}
