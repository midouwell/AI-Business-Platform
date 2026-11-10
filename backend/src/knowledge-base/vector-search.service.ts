import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OllamaService } from '../ollama/ollama.service.js';

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  similarityScore: number;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class VectorSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ollamaService: OllamaService,
  ) {}

  async storeChunks(
    documentId: string,
    chunks: Array<{
      chunkIndex: number;
      content: string;
      metadata?: Record<string, unknown> | null;
    }>,
  ): Promise<void> {
    for (const chunk of chunks) {
      const embedding = await this.ollamaService.embed(chunk.content);
      const vectorLiteral = `[${embedding.join(',')}]`;
      const metadataJson = chunk.metadata ? JSON.stringify(chunk.metadata) : null;

      await this.prisma.$executeRawUnsafe(
        `
          INSERT INTO "DocumentChunk" ("id", "documentId", "chunkIndex", "content", "metadata", "embedding", "createdAt")
          VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5::vector(768), NOW())
          ON CONFLICT ("documentId", "chunkIndex") DO UPDATE SET
            "content" = EXCLUDED."content",
            "metadata" = EXCLUDED."metadata",
            "embedding" = EXCLUDED."embedding";
        `,
        documentId,
        chunk.chunkIndex,
        chunk.content,
        metadataJson,
        vectorLiteral,
      );
    }
  }

  async search(
    userId: string,
    knowledgeBaseId: string,
    query: string,
    topK: number,
    threshold: number,
  ): Promise<RetrievedChunk[]> {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: {
        id: knowledgeBaseId,
        ownerUserId: userId,
      },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException(
        'Knowledge base not found or you do not have access to it.',
      );
    }

    const embedding = await this.ollamaService.embed(query);
    const vectorLiteral = `[${embedding.join(',')}]`;

    const rows = (await this.prisma.$queryRawUnsafe(
      `
        SELECT
          c.id,
          c."documentId",
          c."chunkIndex",
          c.content,
          c.metadata,
          1 - (c.embedding <=> $1::vector(768)) AS similarity,
          d."originalFileName" AS "documentName"
        FROM "DocumentChunk" c
        INNER JOIN "Document" d ON d.id = c."documentId"
        WHERE d."knowledgeBaseId" = $2
        ORDER BY c.embedding <=> $1::vector(768)
        LIMIT $3;
      `,
      vectorLiteral,
      knowledgeBaseId,
      topK,
    )) as Array<{
      id: string;
      documentId: string;
      chunkIndex: number;
      content: string;
      metadata: Record<string, unknown> | null;
      similarity: number;
      documentName: string;
    }>;

    return rows
      .filter((row) => Number(row.similarity) >= threshold)
      .map((row) => ({
        id: row.id,
        documentId: row.documentId,
        documentName: row.documentName,
        chunkIndex: Number(row.chunkIndex),
        content: row.content,
        similarityScore: Number(row.similarity),
        metadata: row.metadata ?? null,
      }));
  }
}
