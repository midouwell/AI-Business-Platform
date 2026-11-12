import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TranscribeAudioDto } from './dto/transcribe-audio.dto.js';
import { SttService, type UploadedAudioFile } from './stt/stt.service.js';
import { SynthesizeSpeechDto } from './dto/synthesize-speech.dto.js';
import { TtsService } from './tts/tts.service.js';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

@Controller('speech')
export class SpeechController {
  constructor(
    private readonly sttService: SttService,
    private readonly ttsService: TtsService,
  ) {}

  @Post('transcriptions')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_AUDIO_BYTES,
        files: 1,
      },
    }),
  )
  async transcribe(
    @UploadedFile() file: UploadedAudioFile | undefined,
    @Body() dto: TranscribeAudioDto,
  ) {
    if (!file) {
      throw new BadRequestException('An audio file is required.');
    }

    return {
      text: await this.sttService.transcribe(file, dto.language),
    };
  }

  @Get('voices')
  listVoices() {
    return this.ttsService.listVoices();
  }

  @Post('synthesis')
  @Header('Content-Type', 'audio/wav')
  @Header('Content-Disposition', 'inline; filename="assistant-response.wav"')
  async synthesize(@Body() dto: SynthesizeSpeechDto) {
    const audio = await this.ttsService.synthesize(
      dto.text,
      dto.voiceId,
      dto.language,
    );
    return new StreamableFile(audio);
  }
}
