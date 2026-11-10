import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Conversation } from '../models/api.models';
import { getApiErrorMessage } from '../errors/api-error';

@Injectable({ providedIn: 'root' })
export class ConversationStore {
  private readonly api = inject(ApiService);
  private readonly conversationList = signal<Conversation[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly conversations = computed(() => this.conversationList());
  readonly isLoading = computed(() => this.loadingState());
  readonly error = computed(() => this.errorState());

  load(): void {
    this.loadingState.set(true);
    this.errorState.set(null);
    this.conversationList.set([]);
    this.api.listConversations().subscribe({
      next: (conversations) => {
        this.conversationList.set(conversations);
        this.loadingState.set(false);
      },
      error: (error: unknown) => {
        this.errorState.set(getApiErrorMessage(error));
        this.loadingState.set(false);
      },
    });
  }

  refresh(): void {
    this.load();
  }
}
