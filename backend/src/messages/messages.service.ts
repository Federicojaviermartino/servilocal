import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, Message } from '../entities';
import { SendMessageDto, ReplyMessageDto } from './dto/message.dto';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  async sendMessage(
    senderId: string,
    dto: SendMessageDto,
  ): Promise<Message> {
    let conversation = await this.findOrCreateConversation(
      senderId,
      dto.recipientId,
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

  async getConversations(userId: string): Promise<Conversation[]> {
    return this.conversationRepository
      .createQueryBuilder('conv')
      .leftJoinAndSelect('conv.participantOne', 'p1')
      .leftJoinAndSelect('conv.participantTwo', 'p2')
      .where('conv.participantOneId = :userId', { userId })
      .orWhere('conv.participantTwoId = :userId', { userId })
      .orderBy('conv.lastMessageAt', 'DESC')
      .getMany();
  }

  async getMessages(
    userId: string,
    conversationId: string,
  ): Promise<Message[]> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }

    if (
      conversation.participantOneId !== userId &&
      conversation.participantTwoId !== userId
    ) {
      throw new ForbiddenException('No perteneces a esta conversación');
    }

    // Marcar como leídos los mensajes del otro participante
    await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({ isRead: true, readAt: new Date() })
      .where('conversationId = :conversationId', { conversationId })
      .andWhere('senderId != :userId', { userId })
      .andWhere('isRead = :isRead', { isRead: false })
      .execute();

    return this.messageRepository.find({
      where: { conversationId },
      relations: ['sender'],
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

  private async findOrCreateConversation(
    userOneId: string,
    userTwoId: string,
  ): Promise<Conversation> {
    const existing = await this.conversationRepository
      .createQueryBuilder('conv')
      .where(
        '(conv.participantOneId = :a AND conv.participantTwoId = :b)',
        { a: userOneId, b: userTwoId },
      )
      .orWhere(
        '(conv.participantOneId = :b AND conv.participantTwoId = :a)',
        { a: userOneId, b: userTwoId },
      )
      .getOne();

    if (existing) return existing;

    const conversation = this.conversationRepository.create({
      participantOneId: userOneId,
      participantTwoId: userTwoId,
    });

    return this.conversationRepository.save(conversation);
  }
}
