import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, Message } from '../entities';
import { SendMessageDto, ReplyMessageDto } from './dto/message.dto';

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
  ) {}

  async sendMessage(senderId: string, dto: SendMessageDto): Promise<Message> {
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
