import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

interface OllamaEmbedResponse {
  embedding?: number[] | number[][];
  model?: string;
  embeddings?: number[] | number[][];
}

interface OllamaStreamChunk {
  model?: string;
  created_at?: string;
  done?: boolean;
  message?: {
    role?: string;
    content?: string;
  };
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly embeddingModel: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService
      .get<string>('OLLAMA_BASE_URL', 'http://localhost:11434')
      .replace(/\/$/, '');

    this.model = this.configService.get<string>(
      'OLLAMA_CHAT_MODEL',
      'qwen2.5:7b',
    );

    this.embeddingModel = this.configService.get<string>(
      'OLLAMA_EMBED_MODEL',
      'nomic-embed-text',
    );
  }

  async chat(message: string | OllamaChatMessage[]): Promise<string> {
    const url = `${this.baseUrl}/api/chat`;

    try {
      this.logger.log(`Sending request to Ollama using ${this.model}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          model: this.model,
          messages:
            typeof message === 'string'
              ? [
                  {
                    role: 'user',
                    content: message,
                  },
                ]
              : message,
          stream: false,
          keep_alive: '5m',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        this.logger.error(
          `Ollama API returned ${response.status}: ${errorBody}`,
        );

        throw new BadGatewayException(
          'Ollama returned an unsuccessful response.',
        );
      }

      const data = (await response.json()) as OllamaChatResponse;

      if (!data.message?.content) {
        throw new BadGatewayException(
          'Ollama returned an empty response.',
        );
      }

      this.logger.log('Successfully received response from Ollama');

      return data.message.content;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error('Failed to communicate with Ollama', error);

      throw new ServiceUnavailableException(
        'Unable to connect to Ollama. Make sure Ollama is running.',
      );
    }
  }

  async chatStream(
    message: string | OllamaChatMessage[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const url = `${this.baseUrl}/api/chat`;

    try {
      this.logger.log(`Streaming chat request to Ollama using ${this.model}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: signal ?? AbortSignal.timeout(120000),
        body: JSON.stringify({
          model: this.model,
          messages:
            typeof message === 'string'
              ? [
                  {
                    role: 'user',
                    content: message,
                  },
                ]
              : message,
          stream: true,
          keep_alive: '5m',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Ollama streaming API returned ${response.status}: ${errorBody}`,
        );
        throw new BadGatewayException(
          'Ollama returned an unsuccessful streaming response.',
        );
      }

      if (!response.body) {
        throw new BadGatewayException('Ollama did not return a stream body.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'null') {
            continue;
          }

          try {
            const payload = JSON.parse(trimmed) as OllamaStreamChunk;
            const chunkContent = payload.message?.content ?? '';

            if (chunkContent) {
              onChunk(chunkContent);
              fullText += chunkContent;
            }

            if (payload.done) {
              return fullText;
            }
          } catch {
            // Ignore malformed stream fragments; they can appear between chunks.
          }
        }
      }

      if (buffer.trim()) {
        try {
          const payload = JSON.parse(buffer.trim()) as OllamaStreamChunk;
          const chunkContent = payload.message?.content ?? '';

          if (chunkContent) {
            onChunk(chunkContent);
            fullText += chunkContent;
          }
        } catch {
          // Ignore malformed trailing fragments.
        }
      }

      return fullText;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      if (signal?.aborted) {
        this.logger.warn('Ollama streaming request aborted by the client.');
        return '';
      }

      this.logger.error('Failed to stream response from Ollama', error);
      throw new ServiceUnavailableException(
        'Unable to stream a response from Ollama. Make sure Ollama is running.',
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/api/embed`;

    try {
      this.logger.log(`Generating embedding with ${this.embeddingModel}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          model: this.embeddingModel,
          input: text,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Ollama embed API returned ${response.status}: ${errorBody}`,
        );
        throw new BadGatewayException('Ollama embedding request failed.');
      }

      const data = (await response.json()) as OllamaEmbedResponse;
      const candidate =
        Array.isArray(data.embedding) && data.embedding.length > 0
          ? data.embedding
          : Array.isArray(data.embeddings) && data.embeddings.length > 0
            ? (data.embeddings[0] as unknown as number[])
            : null;

      if (
        !candidate ||
        !Array.isArray(candidate) ||
        candidate.length !== 768 ||
        candidate.some((value) => typeof value !== 'number')
      ) {
        throw new BadGatewayException(
          'Ollama returned an invalid embedding.',
        );
      }

      return candidate as number[];
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error('Failed to generate embedding with Ollama', error);
      throw new ServiceUnavailableException(
        'Unable to generate embeddings from Ollama.',
      );
    }
  }
}