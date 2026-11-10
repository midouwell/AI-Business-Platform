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

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService
      .get<string>('OLLAMA_BASE_URL', 'http://localhost:11434')
      .replace(/\/$/, '');

    this.model = this.configService.get<string>(
      'OLLAMA_CHAT_MODEL',
      'qwen2.5:7b',
    );
  }

  async chat(message: string): Promise<string> {
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
          messages: [
            {
              role: 'user',
              content: message,
            },
          ],
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
}