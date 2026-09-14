import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { MessagesService } from './messages.service';
import { SendMessageDto, ReplyMessageDto } from './dto/message.dto';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ApiOperation({
    summary: 'Enviar mensaje a otro usuario (crea conversación si no existe)',
  })
  async send(@Request() req: any, @Body() dto: SendMessageDto) {
    return this.messagesService.sendMessage(req.user.id, dto);
  }

  @Post('conversation/:conversationId')
  @ApiOperation({ summary: 'Responder en una conversación existente' })
  async reply(
    @Request() req: any,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: ReplyMessageDto,
  ) {
    return this.messagesService.replyToConversation(
      req.user.id,
      conversationId,
      dto,
    );
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Listar mis conversaciones' })
  async getConversations(@Request() req: any) {
    return this.messagesService.getConversations(req.user.id);
  }

  @Get('conversation/:partnerId')
  @ApiOperation({
    summary:
      'Obtener los mensajes intercambiados con un interlocutor (marca como leídos)',
  })
  async getMessages(
    @Request() req: any,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
  ) {
    return this.messagesService.findMessagesWithPartner(req.user.id, partnerId);
  }

  @Get('unread/count')
  @ApiOperation({ summary: 'Obtener cantidad de mensajes no leídos' })
  async getUnreadCount(@Request() req: any) {
    const count = await this.messagesService.getUnreadCount(req.user.id);
    return { unreadCount: count };
  }
}
