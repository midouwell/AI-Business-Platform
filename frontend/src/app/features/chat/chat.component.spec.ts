import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ChatComponent } from './chat.component';

describe('ChatComponent', () => {
  let http: HttpTestingController;
  const paramMap = new BehaviorSubject(convertToParamMap({ conversationId: 'conversation-id' }));

  beforeEach(async () => {
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

  afterEach(() => http.verify());

  it('loads history and submits a message to the selected conversation', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();

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

  it('does not send an empty message', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();
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
});
