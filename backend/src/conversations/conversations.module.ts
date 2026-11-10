import { Module } from '@nestjs/common';
import { OllamaModule } from '../ollama/ollama.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';

@Module({
  imports: [PrismaModule, OllamaModule, KnowledgeBaseModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
