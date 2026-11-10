import { Injectable } from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service.js';

@Injectable()
export class AiService {
  constructor(private readonly ollamaService: OllamaService) {}

  async chat(message: string) {
    const response = await this.ollamaService.chat(message);

    return {
      model: 'qwen2.5:7b',
      response,
    };
  }
}