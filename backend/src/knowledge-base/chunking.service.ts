import { Injectable } from '@nestjs/common';

export interface ChunkingConfig {
  chunkSize: number;
  chunkOverlap: number;
}

export interface ChunkRecord {
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class ChunkingService {
  private readonly defaultChunkSize = 800;
  private readonly defaultChunkOverlap = 120;

  chunkText(
    text: string,
    documentId: string,
    options?: Partial<ChunkingConfig>,
  ): ChunkRecord[] {
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const chunkOverlap = options?.chunkOverlap ?? this.defaultChunkOverlap;

    if (chunkSize <= chunkOverlap) {
      throw new Error('Chunk size must be larger than chunk overlap.');
    }

    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!normalized) {
      return [];
    }

    const paragraphs = normalized
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);

    const chunks: ChunkRecord[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      const combined = current ? `${current}\n\n${paragraph}` : paragraph;
      if (combined.length <= chunkSize) {
        current = combined;
        continue;
      }

      if (current) {
        chunks.push(this.toChunk(chunks.length, current, documentId));
      }

      const paragraphChunks = this.splitLongParagraph(paragraph, chunkSize, chunkOverlap);
      for (const paragraphChunk of paragraphChunks) {
        chunks.push(this.toChunk(chunks.length, paragraphChunk, documentId));
      }
      current = '';
    }

    if (current) {
      chunks.push(this.toChunk(chunks.length, current, documentId));
    }

    return chunks;
  }

  private splitLongParagraph(
    paragraph: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const normalized = paragraph.replace(/\s+/g, ' ').trim();
    const parts: string[] = [];
    let start = 0;

    while (start < normalized.length) {
      let end = Math.min(start + chunkSize, normalized.length);
      if (end < normalized.length) {
        const lastSpace = normalized.lastIndexOf(' ', end);
        if (lastSpace > start + chunkSize * 0.6) {
          end = lastSpace;
        }
      }

      const slice = normalized.slice(start, end).trim();
      if (slice) {
        parts.push(slice);
      }

      if (end >= normalized.length) {
        break;
      }

      start = Math.max(start + chunkSize - chunkOverlap, end);
    }

    return parts;
  }

  private toChunk(
    chunkIndex: number,
    content: string,
    documentId: string,
  ): ChunkRecord {
    return {
      chunkIndex,
      content,
      metadata: {
        documentId,
        source: 'knowledge-base',
      },
    };
  }
}
