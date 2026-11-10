import { BadRequestException, Injectable } from '@nestjs/common';
import * as path from 'node:path';
import * as mammoth from 'mammoth';

export interface ParsedDocument {
  text: string;
  pageCount?: number;
}

@Injectable()
export class DocumentParserService {
  async extractText(file: {
    originalname: string;
    mimetype?: string;
    buffer: Buffer;
  }): Promise<ParsedDocument> {
    const extension = path.extname(file.originalname).toLowerCase();

    switch (extension) {
      case '.txt':
      case '.md':
        return {
          text: file.buffer.toString('utf-8'),
        };
      case '.docx': {
        const result = await mammoth.extractRawText({
          buffer: file.buffer,
        });
        return {
          text: result.value ?? '',
        };
      }
      case '.pdf':
        return {
          text: await this.extractPdfText(file.buffer),
        };
      default:
        throw new BadRequestException(
          'Unsupported document type. Allowed types: PDF, DOCX, TXT, and Markdown.',
        );
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfData = new Uint8Array(buffer);
    const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text) {
        pages.push(text);
      }
    }

    return pages.join('\n\n');
  }
}
