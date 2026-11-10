import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Conversation, OneOffChatResponse, SendMessageResponse } from '../models/api.models';

const API_BASE = '/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  listConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${API_BASE}/conversations`);
  }

  getConversation(id: string): Observable<Conversation> {
    return this.http.get<Conversation>(`${API_BASE}/conversations/${encodeURIComponent(id)}`);
  }

  createConversation(payload: { title?: string; agentId?: string } = {}): Observable<Conversation> {
    return this.http.post<Conversation>(`${API_BASE}/conversations`, payload);
  }

  sendMessage(conversationId: string, content: string): Observable<SendMessageResponse> {
    return this.http.post<SendMessageResponse>(
      `${API_BASE}/conversations/${encodeURIComponent(conversationId)}/messages`,
      { content },
    );
  }

  chatOnce(message: string): Observable<OneOffChatResponse> {
    return this.http.post<OneOffChatResponse>(`${API_BASE}/ai/chat`, {
      message,
    });
  }
}
