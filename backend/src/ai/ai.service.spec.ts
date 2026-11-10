import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service.js';
import { OllamaService } from '../ollama/ollama.service.js';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: OllamaService,
          useValue: { chat: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
