import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { getApiErrorMessage } from '../../core/errors/api-error';
import { ApiService } from '../../core/services/api.service';
import { ConversationStore } from '../../core/services/conversation-store.service';

@Component({
  imports: [DatePipe, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-workspace',
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
})
export class WorkspaceComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly conversations = inject(ConversationStore);
  readonly user = this.auth.user;
  readonly displayName = computed(() => {
    const user = this.user();
    const fullName = [user?.firstName, user?.lastName]
      .filter((name): name is string => Boolean(name?.trim()))
      .join(' ');
    return fullName || user?.email || 'Account';
  });
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);

  constructor() {
    this.conversations.load();
  }

  startConversation(): void {
    if (this.isCreating()) {
      return;
    }

    this.createError.set(null);
    this.isCreating.set(true);
    this.api.createConversation({ title: 'New chat' }).subscribe({
      next: (conversation) => {
        this.isCreating.set(false);
        this.conversations.refresh();
        void this.router.navigate(['/app/chat', conversation.id]);
      },
      error: (error: unknown) => {
        this.createError.set(getApiErrorMessage(error));
        this.isCreating.set(false);
      },
    });
  }

  signOut(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
