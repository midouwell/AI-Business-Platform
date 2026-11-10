import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { OllamaModule } from '../ollama/ollama.module.js';

@Module({
  imports: [OllamaModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}