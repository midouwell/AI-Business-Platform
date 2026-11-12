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

  it('uploads recorded audio to the local transcription endpoint', () => {
    const audio = new Blob(['audio-data'], { type: 'audio/webm' });

    api.transcribeAudio(audio, 'voice-message.webm', 'en').subscribe((response) => {
      expect(response).toEqual({ text: 'recognized words' });
    });

    const request = http.expectOne('/api/speech/transcriptions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect(request.request.body.get('language')).toBe('en');
    expect(request.request.body.get('file')).toBeInstanceOf(File);
    request.flush({ text: 'recognized words' });
  });

  it('lists configured local speech voices', () => {
    const voices = [
      {
        id: 'en_US-lessac-medium',
        language: 'en-US',
        label: 'en US lessac medium',
        isDefault: true,
      },
    ];

    api.listSpeechVoices().subscribe((result) => {
      expect(result).toEqual(voices);
    });

    const request = http.expectOne('/api/speech/voices');
    expect(request.request.method).toBe('GET');
    request.flush(voices);
  });

  it('requests spoken audio as a binary WAV response', () => {
    const audio = new Blob(['RIFF'], { type: 'audio/wav' });

    api.synthesizeSpeech('Hello there', 'en_US-lessac-medium', 'en-US').subscribe((result) => {
      expect(result).toEqual(audio);
    });

    const request = http.expectOne('/api/speech/synthesis');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      text: 'Hello there',
      voiceId: 'en_US-lessac-medium',
      language: 'en-US',
    });
    expect(request.request.responseType).toBe('blob');
    request.flush(audio);
  });
});
