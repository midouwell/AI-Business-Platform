import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable, Writable } from 'node:stream';

export interface PiperVoice {
  id: string;
  language: string;
  label: string;
  isDefault: boolean;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(private readonly config: ConfigService) {}

  async listVoices(): Promise<PiperVoice[]> {
    const voiceDirectory = this.getVoiceDirectory();
    let entries: string[];
    try {
      entries = await readdir(voiceDirectory);
    } catch (error) {
      this.logger.error('Configured Piper voice directory is unavailable.', error);
      throw new ServiceUnavailableException(
        'The configured local Piper voice directory is unavailable.',
      );
    }

    const defaultVoiceId = this.config.get<string>('PIPER_DEFAULT_VOICE');
    const entrySet = new Set(entries);
    const voices = entries
      .filter(
        (entry) =>
          entry.toLowerCase().endsWith('.onnx') &&
          entrySet.has(`${entry}.json`),
      )
      .map((entry) => {
        const id = entry.slice(0, -'.onnx'.length);
        const languageCode = id.match(/^[a-z]{2,3}[_-][a-z]{2,4}/i)?.[0];
        const language = languageCode?.replace('_', '-') ?? 'und';
        return {
          id,
          language,
          label: id.replace(/[_-]/g, ' '),
          isDefault: id === defaultVoiceId,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));

    if (!voices.length) {
      throw new ServiceUnavailableException(
        'No local Piper voice models are installed in the configured directory.',
      );
    }

    if (defaultVoiceId && !voices.some((voice) => voice.isDefault)) {
      throw new ServiceUnavailableException(
        'PIPER_DEFAULT_VOICE does not match an installed local voice.',
      );
    }
    if (!defaultVoiceId) {
      voices[0].isDefault = true;
    }
    return voices;
  }

  async synthesize(
    text: string,
    voiceId?: string,
    language?: string,
  ): Promise<Buffer> {
    const piperPath = this.config.get<string>('PIPER_PATH');
    if (!piperPath) {
      throw new ServiceUnavailableException(
        'Local speech synthesis is not configured. Set PIPER_PATH.',
      );
    }

    const voices = await this.listVoices();
    const normalizedLanguage = language?.toLowerCase().replace('_', '-');
    const voice = voiceId
      ? voices.find((candidate) => candidate.id === voiceId)
      : normalizedLanguage
        ? voices.find(
            (candidate) =>
              candidate.language.toLowerCase() === normalizedLanguage,
          )
        : voices.find((candidate) => candidate.isDefault);

    if (!voice) {
      throw new BadRequestException(
        'The requested local voice or language is not available.',
      );
    }
    if (
      normalizedLanguage &&
      voice.language.toLowerCase() !== normalizedLanguage
    ) {
      throw new BadRequestException(
        'The selected Piper voice does not support the requested language.',
      );
    }

    const modelPath = path.join(this.getVoiceDirectory(), `${voice.id}.onnx`);
    try {
      await access(modelPath);
    } catch (error) {
      this.logger.error('Selected Piper voice model is unavailable.', error);
      throw new ServiceUnavailableException(
        'The selected local Piper voice model is unavailable.',
      );
    }

    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'ai-business-speech-'),
    );
    const outputPath = path.join(temporaryDirectory, 'response.wav');

    try {
      await this.runPiper(piperPath, modelPath, outputPath, text);
      const audio = await readFile(outputPath);
      if (
        audio.length < 12 ||
        audio.toString('ascii', 0, 4) !== 'RIFF' ||
        audio.toString('ascii', 8, 12) !== 'WAVE'
      ) {
        throw new BadGatewayException(
          'Local Piper did not produce a valid WAV audio response.',
        );
      }
      return audio;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private getVoiceDirectory(): string {
    const voiceDirectory = this.config.get<string>('PIPER_VOICE_DIR');
    if (!voiceDirectory) {
      throw new ServiceUnavailableException(
        'Local speech synthesis is not configured. Set PIPER_VOICE_DIR.',
      );
    }
    return voiceDirectory;
  }

  private runPiper(
    executable: string,
    modelPath: string,
    outputPath: string,
    text: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let child: ChildProcessByStdio<Writable, null, Readable>;
      try {
        child = spawn(
          executable,
          ['--model', modelPath, '--output_file', outputPath],
          {
            windowsHide: true,
            stdio: ['pipe', 'ignore', 'pipe'],
          },
        );
      } catch (error) {
        this.logger.error('Unable to start local Piper.', error);
        reject(
          new ServiceUnavailableException(
            'The configured local Piper executable could not be started.',
          ),
        );
        return;
      }

      let stderr = '';
      let settled = false;
      const timeout = setTimeout(() => {
        child.kill();
        finish(
          new ServiceUnavailableException(
            'Local speech synthesis exceeded its time limit.',
          ),
        );
      }, 120_000);

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', (error) => {
        this.logger.error('Unable to run local Piper.', error);
        finish(
          new ServiceUnavailableException(
            'The configured local Piper executable is unavailable.',
          ),
        );
      });
      child.once('close', (code) => {
        if (code === 0) {
          finish();
          return;
        }

        this.logger.error(
          `Local Piper exited with code ${code}: ${stderr.slice(-4000)}`,
        );
        finish(
          new BadGatewayException(
            'Local Piper failed to synthesize the response.',
          ),
        );
      });
      child.stdin.once('error', (error) => {
        this.logger.error('Unable to send text to local Piper.', error);
        finish(
          new ServiceUnavailableException(
            'Unable to send text to the local Piper executable.',
          ),
        );
      });
      child.stdin.end(text);
    });
  }
}
