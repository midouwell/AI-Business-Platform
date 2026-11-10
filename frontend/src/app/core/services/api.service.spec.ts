import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads conversations from the implemented endpoint', () => {
    const response = [
      {
        id: 'conversation-id',
        title: 'Planning',
        userId: 'user-id',
        agentId: null,
        messages: [],
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      },
    ];

    api.listConversations().subscribe((conversations) => {
      expect(conversations).toEqual(response);
    });

    http.expectOne('/api/conversations').flush(response);
  });

  it('sends message content to the conversation route', () => {
    const response = {
      conversationId: 'conversation-id',
      userMessage: {
        id: 'user-message',
        conversationId: 'conversation-id',
        role: 'USER' as const,
        content: 'Hello',
        metadata: null,
        tokenCount: null,
        createdAt: '2026-11-10T00:00:00.000Z',
      },
      assistantMessage: {
        id: 'assistant-message',
        conversationId: 'conversation-id',
        role: 'ASSISTANT' as const,
        content: 'Hi!',
        metadata: null,
        tokenCount: null,
        createdAt: '2026-11-10T00:00:01.000Z',
      },
    };

    api.sendMessage('conversation-id', 'Hello').subscribe((result) => {
      expect(result).toEqual(response);
    });

    const request = http.expectOne('/api/conversations/conversation-id/messages');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ content: 'Hello' });
    request.flush(response);
  });
});
