import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto.js';
import { RagQueryDto } from './dto/rag-query.dto.js';
import { SearchKnowledgeBaseDto } from './dto/search-knowledge-base.dto.js';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto.js';
import { DocumentIngestionService } from './document-ingestion.service.js';
import { VectorSearchService } from './vector-search.service.js';
import { RagService } from './rag.service.js';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentIngestionService: DocumentIngestionService,
    private readonly vectorSearchService: VectorSearchService,
    private readonly ragService: RagService,
  ) {}

  async createKnowledgeBase(userId: string, dto: CreateKnowledgeBaseDto) {
    return this.prisma.knowledgeBase.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        ownerUserId: userId,
      },
    });
  }

  async listKnowledgeBases(userId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        documents: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  }

  async getKnowledgeBase(userId: string, id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: {
        id,
        ownerUserId: userId,
      },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base not found.');
    }

    return knowledgeBase;
  }

  async updateKnowledgeBase(
    userId: string,
    id: string,
    dto: UpdateKnowledgeBaseDto,
  ) {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: {
        id,
        ownerUserId: userId,
      },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base not found.');
    }

    return this.prisma.knowledgeBase.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
      },
    });
  }

  async deleteKnowledgeBase(userId: string, id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: {
        id,
        ownerUserId: userId,
      },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base not found.');
    }

    await this.prisma.knowledgeBase.delete({
      where: { id },
    });

    return { deletedKnowledgeBaseId: id };
  }

  async uploadDocument(
    userId: string,
    knowledgeBaseId: string,
    file: {
      originalname: string;
      mimetype?: string;
      buffer: Buffer;
      size: number;
    },
  ) {
    return this.documentIngestionService.processUpload(
      userId,
      knowledgeBaseId,
      file,
    );
  }

  async listDocuments(userId: string, knowledgeBaseId: string) {
    await this.assertAccess(userId, knowledgeBaseId);

    return this.prisma.document.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocument(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        uploadedByUserId: userId,
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    return document;
  }

  async reprocessDocument(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        uploadedByUserId: userId,
      },
      select: {
        id: true,
        knowledgeBaseId: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    await this.assertAccess(userId, document.knowledgeBaseId);

    return this.documentIngestionService.reprocessDocument(userId, documentId);
  }

  async deleteDocument(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        uploadedByUserId: userId,
      },
      select: {
        id: true,
        knowledgeBaseId: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    await this.assertAccess(userId, document.knowledgeBaseId);

    return this.documentIngestionService.deleteDocument(userId, documentId);
  }

  async searchKnowledgeBase(
    userId: string,
    knowledgeBaseId: string,
    dto: SearchKnowledgeBaseDto,
  ) {
    await this.assertAccess(userId, knowledgeBaseId);

    const topK = dto.topK ?? 5;
    const threshold = dto.threshold ?? 0.2;

    return this.vectorSearchService.search(
      userId,
      knowledgeBaseId,
      dto.query,
      topK,
      threshold,
    );
  }

  async askQuestion(userId: string, knowledgeBaseId: string, dto: RagQueryDto) {
    await this.assertAccess(userId, knowledgeBaseId);

    const topK = dto.topK ?? 5;
    const threshold = dto.threshold ?? 0.2;

    const sources = await this.vectorSearchService.search(
      userId,
      knowledgeBaseId,
      dto.question,
      topK,
      threshold,
    );

    const answer = await this.ragService.answerQuestion(
      dto.question,
      [],
      null,
      sources,
    );

    return answer;
  }

  async searchRelevantContext(
    userId: string,
    query: string,
    topK = 5,
    threshold = 0.2,
  ) {
    const knowledgeBases = await this.prisma.knowledgeBase.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    });

    if (knowledgeBases.length === 0) {
      return [];
    }

    const results: Array<{
      id: string;
      documentId: string;
      documentName: string;
      chunkIndex: number;
      content: string;
      similarityScore: number;
      metadata?: Record<string, unknown> | null;
    }> = [];

    for (const knowledgeBase of knowledgeBases) {
      const matches = await this.vectorSearchService.search(
        userId,
        knowledgeBase.id,
        query,
        topK,
        threshold,
      );
      results.push(...matches);
    }

    return results
      .sort((left, right) => right.similarityScore - left.similarityScore)
      .slice(0, topK);
  }

  private async assertAccess(userId: string, knowledgeBaseId: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: {
        id: knowledgeBaseId,
        ownerUserId: userId,
      },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new BadRequestException(
        'You do not have access to the requested knowledge base.',
      );
    }
  }
}
