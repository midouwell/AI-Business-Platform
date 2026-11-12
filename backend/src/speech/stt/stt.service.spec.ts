import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SttService, type UploadedAudioFile } from './stt.service.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

function createFile(
  overrides: Partial<UploadedAudioFile> = {},
): UploadedAudioFile {
  return {
    originalname: 'recording.wav',
    mimetype: 'audio/wav',
    size: 4,
    buffer: Buffer.from('wav!'),
    ...overrides,
  };
}

describe('SttService', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
  });

  it('rejects unsupported audio formats before invoking a local runtime', async () => {
    const get = vi.fn();
    const config = {
      get,
    } as unknown as ConfigService;
    const service = new SttService(config);

    await expect(
      service.transcribe(createFile({ originalname: 'recording.exe' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a MIME type that does not match the supported audio type', async () => {
    const service = new SttService({ get: vi.fn() } as unknown as ConfigService);

    await expect(
      service.transcribe(createFile({ mimetype: 'image/png' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports missing local Whisper configuration explicitly', async () => {
    const get = vi.fn().mockReturnValue(undefined);
    const config = {
      get,
    } as unknown as ConfigService;
    const service = new SttService(config);

    await expect(service.transcribe(createFile())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(get).toHaveBeenCalledWith('WHISPER_CPP_PATH');
  });

  it('returns the local Whisper transcript and passes the requested language', async () => {
    const modelDirectory = await mkdtemp(
      path.join(tmpdir(), 'speech-test-model-'),
    );
    const modelPath = path.join(modelDirectory, 'model.bin');
    await writeFile(modelPath, 'test-model');

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const process = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      kill: vi.fn(),
    });
    vi.mocked(spawn).mockImplementation(() => {
      setTimeout(() => {
        stdout.end('  Recognized words  \n');
        stderr.end();
        process.emit('close', 0);
      }, 0);
      return process as never;
    });

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'WHISPER_CPP_PATH') {
          return 'whisper-cli';
        }
        if (key === 'WHISPER_MODEL_PATH') {
          return modelPath;
        }
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new SttService(config);

    try {
      await expect(service.transcribe(createFile(), 'en')).resolves.toBe(
        'Recognized words',
      );
      expect(spawn).toHaveBeenCalledWith(
        'whisper-cli',
        expect.arrayContaining(['-l', 'en']),
        expect.objectContaining({ windowsHide: true }),
      );
    } finally {
      await rm(modelDirectory, { recursive: true, force: true });
    }
  });
});
