import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConversationsService } from './conversations.service.js';
import { MessageRole } from '../generated/prisma/enums.js';
import { UserRole } from '../generated/prisma/enums.js';

const currentUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: UserRole.USER,
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
};

function createPrismaMock() {
  const user = { findUnique: vi.fn() };
  const agent = { findUnique: vi.fn() };
  const conversation = {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const message = {
    create: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
  };

  return {
    user,
    agent,
    conversation,
    message,
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
}

describe('ConversationsService', () => {
  it('creates a conversation for an existing user', async () => {
    const prisma = createPrismaMock();
    const ollama = { chat: vi.fn() };
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.conversation.create.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      title: 'Support',
      messages: [],
    });
    const service = new ConversationsService(
      prisma as never,
      ollama as never,
    );

    const result = await service.createConversation('user-1', {
      title: 'Support',
    });

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: {
        title: 'Support',
        userId: 'user-1',
        agentId: undefined,
      },
      include: expect.any(Object),
    });
    expect(result.id).toBe('conversation-1');
  });

  it('persists the user message, sends history, and persists the assistant message', async () => {
    const prisma = createPrismaMock();
    const ollama = { chat: vi.fn().mockResolvedValue('Your name is Ahmed.') };
    const userMessage = {
      id: 'message-1',
      role: MessageRole.USER,
      content: 'What is my name?',
    };
    const assistantMessage = {
      id: 'message-2',
      role: MessageRole.ASSISTANT,
      content: 'Your name is Ahmed.',
    };

    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      agent: { systemPrompt: 'Be helpful.' },
    });
    prisma.conversation.update.mockResolvedValue({});
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.message.findMany.mockResolvedValue([
      { role: MessageRole.USER, content: 'My name is Ahmed.' },
      { role: MessageRole.ASSISTANT, content: 'Nice to meet you, Ahmed.' },
      userMessage,
    ]);

    const service = new ConversationsService(
      prisma as never,
      ollama as never,
    );

    const result = await service.sendMessage(
      'conversation-1',
      'What is my name?',
      currentUser,
    );

    expect(prisma.message.create).toHaveBeenCalled();
    expect(ollama.chat).toHaveBeenCalledWith([
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'My name is Ahmed.' },
      { role: 'assistant', content: 'Nice to meet you, Ahmed.' },
      { role: 'user', content: 'What is my name?' },
    ]);
    expect(result.assistantMessage).toEqual(assistantMessage);
  });

  it('retrieves messages in chronological order', async () => {
    const prisma = createPrismaMock();
    const messages = [
      { id: 'message-1', createdAt: new Date('2026-01-01') },
      { id: 'message-2', createdAt: new Date('2026-01-02') },
    ];
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      messages,
    });
    const service = new ConversationsService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.getConversationHistory('conversation-1', currentUser),
    ).resolves.toMatchObject({ messages });
    expect(prisma.conversation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          messages: expect.objectContaining({ orderBy: expect.any(Array) }),
        }),
      }),
    );
  });

  it('throws when the conversation does not exist', async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findUnique.mockResolvedValue(null);
    const service = new ConversationsService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.sendMessage('conversation-1', 'Hello', currentUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects access to another user conversation', async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'another-user',
      messages: [],
    });
    const service = new ConversationsService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.getConversationHistory('conversation-1', currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removes the unfulfilled user message when Ollama is unavailable', async () => {
    const prisma = createPrismaMock();
    const unavailable = new ServiceUnavailableException(
      'Unable to connect to Ollama.',
    );
    const ollama = { chat: vi.fn().mockRejectedValue(unavailable) };
    const userMessage = {
      id: 'message-1',
      role: MessageRole.USER,
      content: 'Hello',
    };

    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      agent: null,
    });
    prisma.conversation.update.mockResolvedValue({});
    prisma.message.create.mockResolvedValue(userMessage);
    prisma.message.findMany.mockResolvedValue([userMessage]);
    prisma.message.delete.mockResolvedValue(userMessage);
    const service = new ConversationsService(
      prisma as never,
      ollama as never,
    );

    await expect(
      service.sendMessage('conversation-1', 'Hello', currentUser),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.message.delete).toHaveBeenCalledWith({
      where: { id: 'message-1' },
    });
  });
});
