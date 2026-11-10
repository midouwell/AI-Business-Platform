import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentParserService } from './document-parser.service.js';
import { ChunkingService } from './chunking.service.js';
import { VectorSearchService } from './vector-search.service.js';

type UploadedDocumentFile = {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
  size: number;
};

@Injectable()
export class DocumentIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parserService: DocumentParserService,
    private readonly chunkingService: ChunkingService,
    private readonly vectorService: VectorSearchService,
  ) {}

  async processUpload(
    userId: string,
    knowledgeBaseId: string,
    file: UploadedDocumentFile,
  ) {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: {
        id: knowledgeBaseId,
        ownerUserId: userId,
      },
      select: { id: true, name: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException(
        'Knowledge base not found or you do not have access to it.',
      );
    }

    const allowedExtensions = ['.pdf', '.docx', '.txt', '.md'];
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        'Unsupported document type. Allowed types: PDF, DOCX, TXT, and Markdown.',
      );
    }

    const storageDirectory = path.join(process.cwd(), 'storage', 'knowledge-base');
    await mkdir(storageDirectory, { recursive: true });

    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const storedFilePath = path.join(storageDirectory, safeName);
    await writeFile(storedFilePath, file.buffer);

    const document = await this.prisma.document.create({
      data: {
        knowledgeBaseId,
        uploadedByUserId: userId,
        originalFileName: file.originalname,
        storedFilePath,
        mimeType: file.mimetype || 'application/octet-stream',
        fileSizeBytes: file.size,
        status: 'PROCESSING',
      },
    });

    try {
      const parsed = await this.parserService.extractText({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
      });

      const chunks = this.chunkingService.chunkText(parsed.text, document.id, {
        chunkSize: 800,
        chunkOverlap: 120,
      });

      await this.vectorService.storeChunks(
        document.id,
        chunks.map((chunk) => ({
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          metadata: {
            ...chunk.metadata,
            source: file.originalname,
          },
        })),
      );

      const updatedDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: 'READY',
          extractedText: parsed.text,
          errorMessage: null,
        },
      });

      return {
        ...updatedDocument,
        chunkCount: chunks.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Document processing failed.';

      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: 'FAILED',
          errorMessage,
        },
      });

      throw new BadRequestException(errorMessage);
    }
  }

  async reprocessDocument(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        uploadedByUserId: userId,
      },
      include: { knowledgeBase: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const fileBuffer = await readFile(document.storedFilePath);
    const file: UploadedDocumentFile = {
      originalname: document.originalFileName,
      mimetype: document.mimeType ?? 'application/octet-stream',
      buffer: fileBuffer,
      size: document.fileSizeBytes,
    };

    await this.prisma.documentChunk.deleteMany({
      where: { documentId },
    });

    return this.processUpload(userId, document.knowledgeBaseId, file);
  }

  async deleteDocument(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        uploadedByUserId: userId,
      },
      select: {
        id: true,
        storedFilePath: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    await this.prisma.document.delete({
      where: { id: documentId },
    });

    try {
      await unlink(document.storedFilePath);
    } catch {
      // Ignore file cleanup errors for already-deleted or missing files.
    }

    return { deletedDocumentId: document.id };
  }
}
