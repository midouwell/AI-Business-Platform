import { DatePipe } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ConversationStore } from '../../core/services/conversation-store.service';
import { getApiErrorMessage } from '../../core/errors/api-error';
import { Conversation, ConversationMessage } from '../../core/models/api.models';

@Component({
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements AfterViewChecked {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly conversations = inject(ConversationStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;

  readonly conversation = signal<Conversation | null>(null);
  readonly messages = signal<ConversationMessage[]>([]);
  readonly isLoading = signal(true);
  readonly isSending = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(4000), Validators.pattern(/\S/)]],
  });
  private shouldScrollToBottom = false;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('conversationId');
      if (id) {
        this.loadConversation(id);
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.messageList) {
      this.messageList.nativeElement.scrollTop = this.messageList.nativeElement.scrollHeight;
      this.shouldScrollToBottom = false;
    }
  }

  submit(): void {
    if (this.form.invalid || this.isSending()) {
      this.form.markAllAsTouched();
      return;
    }

    const conversation = this.conversation();
    const content = this.form.controls.content.value.trim();
    if (!conversation || !content) {
      return;
    }

    this.errorMessage.set(null);
    this.isSending.set(true);
    this.api
      .sendMessage(conversation.id, content)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ userMessage, assistantMessage }) => {
          this.messages.update((messages) => [...messages, userMessage, assistantMessage]);
          this.conversation.update((current) =>
            current
              ? {
                  ...current,
                  messages: [...current.messages, userMessage, assistantMessage],
                }
              : current,
          );
          this.form.reset();
          this.isSending.set(false);
          this.shouldScrollToBottom = true;
          this.conversations.refresh();
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error));
          this.isSending.set(false);
        },
      });
  }

  private loadConversation(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.conversation.set(null);
    this.messages.set([]);
    this.api
      .getConversation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (conversation) => {
          this.conversation.set(conversation);
          this.messages.set(conversation.messages);
          this.isLoading.set(false);
          this.shouldScrollToBottom = true;
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error));
          this.isLoading.set(false);
        },
      });
  }
}
