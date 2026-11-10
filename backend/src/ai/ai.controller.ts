import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { ChatDto } from './dto/chat.dto.js';

// @Controller('ai')
// export class AiController {
//   constructor(private readonly aiService: AiService) {}

//   @Post('chat')
//   async chat(@Body() body: { message?: string }) {
//     if (
//       typeof body?.message !== 'string' ||
//       body.message.trim().length === 0
//     ) {
//       throw new BadRequestException('Message is required.');
//     }

//     return this.aiService.chat(body.message.trim());
//   }
//}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() dto: ChatDto) {
    return this.aiService.chat(dto.message);
  }
}