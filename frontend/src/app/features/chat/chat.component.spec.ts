import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ChatComponent } from './chat.component';

const speechVoices = [
  {
    id: 'en_US-lessac-medium',
    language: 'en-US',
    label: 'English (US) Lessac',
    isDefault: true,
  },
  {
    id: 'fr_FR-siwis-medium',
    language: 'fr-FR',
    label: 'French (France) Siwis',
    isDefault: true,
  },
];

function flushInitialData(
  http: HttpTestingController,
  knowledgeBases: unknown[] = [],
): void {
  http.expectOne('/api/knowledge-bases').flush(knowledgeBases);
  http.expectOne('/api/speech/voices').flush(speechVoices);
}

describe('ChatComponent', () => {
  let http: HttpTestingController;
  let originalMediaDevices: PropertyDescriptor | undefined;
  const paramMap = new BehaviorSubject(convertToParamMap({ conversationId: 'conversation-id' }));

  beforeEach(async () => {
    localStorage.removeItem('ai-business-platform.voice.autoPlay');
    localStorage.removeItem('ai-business-platform.voice.voiceId');
    localStorage.removeItem('ai-business-platform.voice.language');
    originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    await TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
    vi.unstubAllGlobals();
  });

  it('loads history and submits a message to the selected conversation', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();

    flushInitialData(http);
    http.expectOne('/api/conversations/conversation-id').flush({
      id: 'conversation-id',
      title: 'A conversation',
      userId: 'user-id',
      agentId: null,
      agent: null,
      messages: [],
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.form.controls.content.setValue('Hello assistant');
    component.submit();

    const send = http.expectOne('/api/conversations/conversation-id/messages');
    expect(send.request.method).toBe('POST');
    expect(send.request.body).toEqual({ content: 'Hello assistant' });
    send.flush({
      conversationId: 'conversation-id',
      userMessage: {
        id: 'user-message',
        conversationId: 'conversation-id',
        role: 'USER',
        content: 'Hello assistant',
        metadata: null,
        tokenCount: null,
        createdAt: '2026-11-10T00:00:01.000Z',
      },
      assistantMessage: {
        id: 'assistant-message',
        conversationId: 'conversation-id',
        role: 'ASSISTANT',
        content: 'Hello there',
        metadata: null,
        tokenCount: null,
        createdAt: '2026-11-10T00:00:02.000Z',
      },
    });

    expect(component.messages().map((message) => message.content)).toEqual([
      'Hello assistant',
      'Hello there',
    ]);

    http.expectOne('/api/conversations').flush([]);
  });

  it('loads knowledge bases and sends the selected KB question to the backend', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();

    flushInitialData(http, [
      { id: 'kb-1', name: 'Operations guide', description: 'Policy docs', ownerUserId: 'user-id', createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z' },
    ]);
    http.expectOne('/api/conversations/conversation-id').flush({
      id: 'conversation-id',
      title: 'A conversation',
      userId: 'user-id',
      agentId: null,
      agent: null,
      messages: [],
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    });

    const component = fixture.componentInstance;
    component.selectedKnowledgeBaseId.set('kb-1');
    component.ragForm.controls.question.setValue('What is the refund policy?');
    component.askSelectedKnowledgeBase();

    const request = http.expectOne('/api/knowledge-bases/kb-1/chat');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      question: 'What is the refund policy?',
      topK: 5,
      threshold: 0.2,
    });

    request.flush({
      answer: 'The refund policy is 30 days.',
      sources: [
        {
          documentId: 'doc-1',
          documentName: 'refund-policy.pdf',
          chunkId: 'chunk-1',
          chunkIndex: 0,
          similarityScore: 0.91,
          content: 'Refunds are available for 30 days after purchase.',
          metadata: { pageNumber: 2 },
        },
      ],
    });

    expect(component.ragResponse()?.answer).toBe('The refund policy is 30 days.');
    expect(component.ragResponse()?.sources[0].documentName).toBe('refund-policy.pdf');
  });

  it('does not send an empty message', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    flushInitialData(http);
    http.expectOne('/api/conversations/conversation-id').flush({
      id: 'conversation-id',
      title: null,
      userId: 'user-id',
      agentId: null,
      messages: [],
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    });

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.form.controls.content.touched).toBe(true);
    http.expectNone('/api/conversations/conversation-id/messages');
  });

  it('records audio, previews the transcription, and sends edited text through chat', async () => {
    const track = { stop: vi.fn() };
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    class FakeMediaRecorder {
      static isTypeSupported = vi.fn(() => true);
      state: RecordingState = 'inactive';
      mimeType = 'audio/webm;codecs=opus';
      private readonly listeners = new Map<string, EventListener[]>();

      constructor(
        _stream: MediaStream,
        _options?: MediaRecorderOptions,
      ) {}

      addEventListener(type: string, listener: EventListener): void {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      start(): void {
        this.state = 'recording';
      }

      stop(): void {
        this.state = 'inactive';
        const dataEvent = Object.assign(new Event('dataavailable'), {
          data: new Blob(['recorded audio'], { type: 'audio/webm' }),
        });
        this.listeners.get('dataavailable')?.forEach((listener) => listener(dataEvent));
        this.listeners.get('stop')?.forEach((listener) => listener(new Event('stop')));
      }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    flushInitialData(http);
    http.expectOne('/api/conversations/conversation-id').flush({
      id: 'conversation-id',
      title: 'Voice chat',
      userId: 'user-id',
      agentId: null,
      agent: null,
      messages: [],
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    });

    const component = fixture.componentInstance;
    await component.startRecording();
    expect(component.isRecording()).toBe(true);

    component.stopRecording();
    expect(track.stop).toHaveBeenCalled();

    const transcription = http.expectOne('/api/speech/transcriptions');
    expect(transcription.request.method).toBe('POST');
    const formData = transcription.request.body as FormData;
    expect(formData.get('file')).toBeInstanceOf(File);
    transcription.flush({ text: 'recognized words' });
    expect(component.form.controls.content.value).toBe('recognized words');

    component.form.controls.content.setValue('edited recognized words');
    component.submit();
    const message = http.expectOne('/api/conversations/conversation-id/messages');
    expect(message.request.body).toEqual({ content: 'edited recognized words' });
    message.flush({
      conversationId: 'conversation-id',
      userMessage: {
        id: 'user-message',
        conversationId: 'conversation-id',
        role: 'USER',
        content: 'edited recognized words',
        metadata: null,
        tokenCount: null,
        createdAt: '2026-11-10T00:00:01.000Z',
      },
      assistantMessage: {
        id: 'assistant-message',
        conversationId: 'conversation-id',
        role: 'ASSISTANT',
        content: 'answer',
        metadata: null,
        tokenCount: null,
        createdAt: '2026-11-10T00:00:02.000Z',
      },
    });
    expect(component.messages().map(({ content }) => content)).toEqual([
      'edited recognized words',
      'answer',
    ]);
    http.expectOne('/api/conversations').flush([]);
  });

  it('shows a clear error when microphone permission is denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
      },
    });
    vi.stubGlobal('MediaRecorder', class {});

    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    flushInitialData(http);
    http.expectOne('/api/conversations/conversation-id').flush({
      id: 'conversation-id',
      title: null,
      userId: 'user-id',
      agentId: null,
      agent: null,
      messages: [],
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    });

    await fixture.componentInstance.startRecording();

    expect(fixture.componentInstance.voiceErrorMessage()).toContain(
      'Microphone permission was denied',
    );
    http.expectNone('/api/speech/transcriptions');
  });

  it('stores voice settings locally and auto-plays the selected language voice', async () => {
    const createObjectURL = vi.fn(() => 'blob:auto-audio');
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });

    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    flushInitialData(http);
    http.expectOne('/api/conversations/conversation-id').flush({
      id: 'conversation-id',
      title: 'Voice settings',
      userId: 'user-id',
      agentId: null,
      agent: null,
      messages: [],
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.setSpeechLanguage('fr-FR');
    component.setAutoPlayResponses(true);
    expect(component.selectedSpeechVoiceId()).toBe('fr_FR-siwis-medium');
    expect(localStorage.getItem('ai-business-platform.voice.language')).toBe('fr-FR');
    expect(localStorage.getItem('ai-business-platform.voice.autoPlay')).toBe('true');

    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    const play = vi.spyOn(audio, 'play').mockResolvedValue();
    vi.spyOn(audio, 'pause').mockImplementation(() => {});
    vi.spyOn(audio, 'load').mockImplementation(() => {});

    component.form.controls.content.setValue('Bonjour');
    component.submit();
    http.expectOne('/api/conversations/conversation-id/messages').flush({
      conversationId: 'conversation-id',
      userMessage: {
        id: 'user-message',
        conversationId: 'conversation-id',
        role: 'USER',
        content: 'Bonjour',
        metadata: null,
        tokenCount: null,
        createdAt: '2026-11-10T00:00:01.000Z',
      },
      assistantMessage: {
        id: 'assistant-message',
        conversationId: 'conversation-id',
        role: 'ASSISTANT',
        content: 'Bonjour!',
        metadata: null,
        tokenCount: null,
        createdAt: '2026-11-10T00:00:02.000Z',
      },
    });
    http.expectOne('/api/conversations').flush([]);

    const synthesis = http.expectOne('/api/speech/synthesis');
    expect(synthesis.request.body).toEqual({
      text: 'Bonjour!',
      voiceId: 'fr_FR-siwis-medium',
      language: 'fr-FR',
    });
    synthesis.flush(new Blob(['RIFF'], { type: 'audio/wav' }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(component.activeAudioMessageId()).toBe('assistant-message');
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('generates and controls spoken playback for assistant messages', async () => {
    const createObjectURL = vi.fn(() => 'blob:assistant-audio');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
    flushInitialData(http);
    http.expectOne('/api/conversations/conversation-id').flush({
      id: 'conversation-id',
      title: 'Audio response',
      userId: 'user-id',
      agentId: null,
      agent: null,
      messages: [],
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    });

    const component = fixture.componentInstance;
    const assistantMessage = {
      id: 'assistant-message',
      conversationId: 'conversation-id',
      role: 'ASSISTANT' as const,
      content: 'Hello there',
      metadata: null,
      tokenCount: null,
      createdAt: '2026-11-10T00:00:01.000Z',
    };
    component.messages.set([assistantMessage]);
    fixture.detectChanges();
    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    const play = vi.spyOn(audio, 'play').mockResolvedValue();
    vi.spyOn(audio, 'pause').mockImplementation(() => {});
    vi.spyOn(audio, 'load').mockImplementation(() => {});

    component.playResponse(assistantMessage);
    const request = http.expectOne('/api/speech/synthesis');
    expect(request.request.body).toEqual({
      text: 'Hello there',
      voiceId: 'en_US-lessac-medium',
      language: 'en-US',
    });
    const response = new Blob(['RIFF'], { type: 'audio/wav' });
    request.flush(response);

    expect(createObjectURL).toHaveBeenCalledWith(response);
    expect(component.activeAudioMessageId()).toBe('assistant-message');
    expect(audio.src).toBe('blob:assistant-audio');
    expect(play).toHaveBeenCalledTimes(1);

    component.pauseResponse();
    expect(component.isAudioPaused()).toBe(true);
    component.playResponse(assistantMessage);
    expect(play).toHaveBeenCalledTimes(2);
    component.stopResponse();
    expect(component.isAudioPlaying()).toBe(false);
    expect(component.isAudioPaused()).toBe(false);
    component.ngOnDestroy();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:assistant-audio');
  });
});
