import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OllamaModule } from '../ollama/ollama.module.js';
import { KnowledgeBaseController } from './knowledge-base.controller.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import { DocumentIngestionService } from './document-ingestion.service.js';
import { DocumentParserService } from './document-parser.service.js';
import { ChunkingService } from './chunking.service.js';
import { VectorSearchService } from './vector-search.service.js';
import { RagService } from './rag.service.js';

@Module({
  imports: [PrismaModule, OllamaModule],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    DocumentIngestionService,
    DocumentParserService,
    ChunkingService,
    VectorSearchService,
    RagService,
  ],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
