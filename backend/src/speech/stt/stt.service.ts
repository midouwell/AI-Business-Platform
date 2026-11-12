import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { Readable } from 'node:stream';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UploadedAudioFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const SUPPORTED_AUDIO: Record<string, string[]> = {
  '.aac': ['audio/aac', 'audio/mp4', 'application/octet-stream'],
  '.flac': ['audio/flac', 'audio/x-flac', 'application/octet-stream'],
  '.m4a': ['audio/mp4', 'audio/x-m4a', 'application/octet-stream'],
  '.mp3': ['audio/mpeg', 'audio/mp3', 'application/octet-stream'],
  '.ogg': ['audio/ogg', 'application/ogg', 'application/octet-stream'],
  '.wav': ['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream'],
  '.webm': ['audio/webm', 'video/webm', 'application/octet-stream'],
};

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);

  constructor(private readonly config: ConfigService) {}

  async transcribe(
    file: UploadedAudioFile,
    language?: string,
  ): Promise<string> {
    this.validateFile(file);

    const whisperPath = this.config.get<string>('WHISPER_CPP_PATH');
    const modelPath = this.config.get<string>('WHISPER_MODEL_PATH');
    if (!whisperPath || !modelPath) {
      throw new ServiceUnavailableException(
        'Local transcription is not configured. Set WHISPER_CPP_PATH and WHISPER_MODEL_PATH.',
      );
    }

    try {
      await access(modelPath);
    } catch (error) {
      this.logger.error('Configured Whisper model file is unavailable.', error);
      throw new ServiceUnavailableException(
        'The configured local Whisper model is unavailable.',
      );
    }

    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'ai-business-speech-'),
    );
    const extension = path.extname(file.originalname).toLowerCase();
    const inputPath = path.join(temporaryDirectory, `input${extension}`);
    const wavPath = path.join(temporaryDirectory, 'normalized.wav');

    try {
      await writeFile(inputPath, file.buffer, { mode: 0o600 });

      let whisperInput = inputPath;
      if (extension !== '.wav') {
        const ffmpegPath = this.config.get<string>('FFMPEG_PATH', 'ffmpeg');
        await this.runProcess(ffmpegPath, [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          inputPath,
          '-ar',
          '16000',
          '-ac',
          '1',
          '-c:a',
          'pcm_s16le',
          wavPath,
        ]);
        whisperInput = wavPath;
      }

      const args = ['-m', modelPath, '-f', whisperInput, '-nt', '-np'];
      if (language) {
        args.push('-l', language.toLowerCase());
      }

      const transcript = (await this.runProcess(whisperPath, args)).trim();
      if (!transcript) {
        throw new BadGatewayException(
          'The local speech recognizer returned an empty transcript.',
        );
      }

      return transcript;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private validateFile(file: UploadedAudioFile): void {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedMimeTypes = SUPPORTED_AUDIO[extension];
    const mimeType = file.mimetype.toLowerCase().split(';', 1)[0];

    if (!allowedMimeTypes || !allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(
        'Unsupported audio type. Use WAV, WebM, OGG, MP3, M4A, AAC, or FLAC audio.',
      );
    }

    if (!file.size || file.size > MAX_AUDIO_BYTES) {
      throw new BadRequestException(
        'Audio files must be between 1 byte and 20 MB.',
      );
    }
  }

  private runProcess(executable: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let child: ChildProcessByStdio<null, Readable, Readable>;
      try {
        child = spawn(executable, args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        this.logger.error(`Unable to start local speech process: ${executable}`, error);
        reject(
          new ServiceUnavailableException(
            'A required local speech executable could not be started.',
          ),
        );
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timeout = setTimeout(() => {
        child.kill();
        finish(
          new ServiceUnavailableException(
            'Local speech processing exceeded its time limit.',
          ),
        );
      }, 120_000);

      const finish = (error?: Error, output?: string) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          resolve(output ?? '');
        }
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', (error) => {
        this.logger.error(
          `Unable to run local speech executable: ${executable}`,
          error,
        );
        finish(
          new ServiceUnavailableException(
            'A required local speech executable is unavailable.',
          ),
        );
      });
      child.once('close', (code) => {
        if (code === 0) {
          finish(undefined, stdout);
          return;
        }

        this.logger.error(
          `Local speech process exited with code ${code}: ${stderr.slice(-4000)}`,
        );
        finish(
          new BadGatewayException(
            'Local speech processing failed. Check the Whisper and audio conversion configuration.',
          ),
        );
      });
    });
  }
}
