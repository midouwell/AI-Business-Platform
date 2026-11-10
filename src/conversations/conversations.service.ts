import {
  HttpException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service.js';
import { OllamaChatMessage } from '../ollama/ollama.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessageRole } from '../generated/prisma/enums.js';
import { CreateConversationDto } from './dto/create-conversation.dto.js';
import { AuthenticatedUser } from '../auth/authenticated-user.interface.js';
import { UserRole } from '../generated/prisma/enums.js';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ollamaService: OllamaService,
  ) {}

  async createConversation(userId: string, dto: CreateConversationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (dto.agentId) {
      const agent = await this.prisma.agent.findUnique({
        where: { id: dto.agentId },
        select: { id: true },
      });

      if (!agent) {
        throw new NotFoundException('Agent not found.');
      }
    }

    return this.prisma.conversation.create({
      data: {
        title: dto.title,
        userId,
        agentId: dto.agentId,
      },
      include: {
        agent: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async sendMessage(
    conversationId: string,
    content: string,
    user: AuthenticatedUser,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        agent: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    this.assertConversationAccess(conversation, user);

    let userMessage;
    try {
      [, userMessage] = await this.prisma.$transaction([
        this.prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
        this.prisma.message.create({
          data: {
            conversationId,
            role: MessageRole.USER,
            content,
          },
        }),
      ]);

      const history = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      const ollamaMessages = this.formatHistory(
        history.map(({ role, content }) => ({ role, content })),
        conversation.agent?.systemPrompt,
      );

      let assistantContent: string;
      try {
        assistantContent = await this.ollamaService.chat(ollamaMessages);
      } catch (error) {
        await this.prisma.message.delete({
          where: { id: userMessage.id },
        });
        throw error;
      }

      const [, assistantMessage] = await this.prisma.$transaction([
        this.prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
        this.prisma.message.create({
          data: {
            conversationId,
            role: MessageRole.ASSISTANT,
            content: assistantContent,
          },
        }),
      ]);

      return {
        conversationId,
        userMessage,
        assistantMessage,
      };
    } catch (error) {
      if (
        error instanceof HttpException ||
        error instanceof Error && error.name === 'ServiceUnavailableException'
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Unable to persist conversation message.',
      );
    }
  }

  async getConversationHistory(
    conversationId: string,
    user: AuthenticatedUser,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    this.assertConversationAccess(conversation, user);

    return conversation;
  }

  async getUserConversations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        agent: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private assertConversationAccess(
    conversation: { userId: string },
    user: AuthenticatedUser,
  ): void {
    if (user.role !== UserRole.ADMIN && conversation.userId !== user.id) {
      throw new ForbiddenException(
        'You do not have access to this conversation.',
      );
    }
  }

  private formatHistory(
    history: Array<{ role: string; content: string }>,
    systemPrompt?: string | null,
  ): OllamaChatMessage[] {
    const messages: OllamaChatMessage[] = [];

    if (systemPrompt?.trim()) {
      messages.push({
        role: 'system',
        content: systemPrompt.trim(),
      });
    }

    for (const message of history) {
      if (
        message.role === MessageRole.USER ||
        message.role === MessageRole.ASSISTANT ||
        message.role === MessageRole.SYSTEM
      ) {
        messages.push({
          role: message.role.toLowerCase() as
            | 'system'
            | 'user'
            | 'assistant',
          content: message.content,
        });
      }
    }

    return messages;
  }
}
