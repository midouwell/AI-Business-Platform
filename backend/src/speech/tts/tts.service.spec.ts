import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsService } from './tts.service.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('TtsService', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
  });

  it('lists only configured local Piper models and reports their language', async () => {
    const voiceDirectory = await mkdtemp(
      path.join(tmpdir(), 'speech-test-voices-'),
    );
    await writeFile(path.join(voiceDirectory, 'en_US-lessac-medium.onnx'), '');
    await writeFile(
      path.join(voiceDirectory, 'en_US-lessac-medium.onnx.json'),
      '{}',
    );
    await writeFile(path.join(voiceDirectory, 'ignored.txt'), '');

    const config = {
      get: vi.fn((key: string) =>
        key === 'PIPER_VOICE_DIR' ? voiceDirectory : undefined,
      ),
    } as unknown as ConfigService;
    const service = new TtsService(config);

    try {
      await expect(service.listVoices()).resolves.toEqual([
        {
          id: 'en_US-lessac-medium',
          language: 'en-US',
          label: 'en US lessac medium',
          isDefault: true,
        },
      ]);
    } finally {
      await rm(voiceDirectory, { recursive: true, force: true });
    }
  });

  it('rejects a voice that is not installed', async () => {
    const voiceDirectory = await mkdtemp(
      path.join(tmpdir(), 'speech-test-voices-'),
    );
    const voiceId = 'en_US-lessac-medium';
    await writeFile(path.join(voiceDirectory, `${voiceId}.onnx`), 'model');
    await writeFile(path.join(voiceDirectory, `${voiceId}.onnx.json`), '{}');
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'PIPER_PATH') {
          return 'piper';
        }
        if (key === 'PIPER_VOICE_DIR') {
          return voiceDirectory;
        }
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new TtsService(config);

    try {
      await expect(
        service.synthesize('Hello', 'unknown-voice'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      await rm(voiceDirectory, { recursive: true, force: true });
    }
  });

  it('runs local Piper and returns its generated WAV audio', async () => {
    const voiceDirectory = await mkdtemp(
      path.join(tmpdir(), 'speech-test-voices-'),
    );
    const voiceId = 'en_US-lessac-medium';
    await writeFile(path.join(voiceDirectory, `${voiceId}.onnx`), 'model');
    await writeFile(path.join(voiceDirectory, `${voiceId}.onnx.json`), '{}');

    const stdin = new PassThrough();
    const stderr = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      stdin,
      stderr,
      kill: vi.fn(),
    });
    const wav = Buffer.alloc(16);
    wav.write('RIFF', 0, 'ascii');
    wav.write('WAVE', 8, 'ascii');
    vi.mocked(spawn).mockImplementation((_executable, rawArgs) => {
      const args = rawArgs as string[];
      const outputPath = args[args.indexOf('--output_file') + 1];
      setTimeout(() => {
        void writeFile(outputPath, wav).then(() => {
          stderr.end();
          child.emit('close', 0);
        });
      }, 0);
      return child as never;
    });

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'PIPER_PATH') {
          return 'piper';
        }
        if (key === 'PIPER_VOICE_DIR') {
          return voiceDirectory;
        }
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new TtsService(config);

    try {
      await expect(
        service.synthesize('Hello there', voiceId, 'en-US'),
      ).resolves.toEqual(wav);
      expect(spawn).toHaveBeenCalledWith(
        'piper',
        expect.arrayContaining(['--model', path.join(voiceDirectory, `${voiceId}.onnx`)]),
        expect.objectContaining({ windowsHide: true }),
      );
    } finally {
      await rm(voiceDirectory, { recursive: true, force: true });
    }
  });

  it('requires the selected voice language to match the requested language', async () => {
    const voiceDirectory = await mkdtemp(
      path.join(tmpdir(), 'speech-test-voices-'),
    );
    const voiceId = 'en_US-lessac-medium';
    await writeFile(path.join(voiceDirectory, `${voiceId}.onnx`), 'model');
    await writeFile(path.join(voiceDirectory, `${voiceId}.onnx.json`), '{}');
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'PIPER_PATH') {
          return 'piper';
        }
        if (key === 'PIPER_VOICE_DIR') {
          return voiceDirectory;
        }
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new TtsService(config);

    try {
      await expect(
        service.synthesize('Hello', voiceId, 'fr-FR'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      await rm(voiceDirectory, { recursive: true, force: true });
    }
  });
});
