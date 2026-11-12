import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SpeechController } from './speech.controller.js';
import { SttService } from './stt/stt.service.js';
import { TtsService } from './tts/tts.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [SpeechController],
  providers: [SttService, TtsService],
})
export class SpeechModule {}
