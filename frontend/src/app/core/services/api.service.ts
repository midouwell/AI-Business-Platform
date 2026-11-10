import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Conversation,
  DocumentSummary,
  KnowledgeBase,
  KnowledgeBaseChatRequest,
  KnowledgeBaseChatResponse,
  KnowledgeBaseWithDocuments,
  KnowledgeSearchResult,
  OneOffChatResponse,
  SendMessageResponse,
  UpdateKnowledgeBaseRequest,
} from '../models/api.models';

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

  createKnowledgeBase(payload: { name: string; description?: string | null }): Observable<KnowledgeBase> {
    return this.http.post<KnowledgeBase>(`${API_BASE}/knowledge-bases`, payload);
  }

  getKnowledgeBase(knowledgeBaseId: string): Observable<KnowledgeBaseWithDocuments> {
    return this.http.get<KnowledgeBaseWithDocuments>(
      `${API_BASE}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
    );
  }

  updateKnowledgeBase(
    knowledgeBaseId: string,
    payload: UpdateKnowledgeBaseRequest,
  ): Observable<KnowledgeBase> {
    return this.http.patch<KnowledgeBase>(
      `${API_BASE}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
      payload,
    );
  }

  deleteKnowledgeBase(knowledgeBaseId: string): Observable<{ deletedKnowledgeBaseId: string }> {
    return this.http.delete<{ deletedKnowledgeBaseId: string }>(
      `${API_BASE}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
    );
  }

  listKnowledgeBases(): Observable<KnowledgeBase[]> {
    return this.http.get<KnowledgeBase[]>(`${API_BASE}/knowledge-bases`);
  }

  listKnowledgeBaseDocuments(knowledgeBaseId: string): Observable<DocumentSummary[]> {
    return this.http.get<DocumentSummary[]>(
      `${API_BASE}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`,
    );
  }

  uploadDocument(knowledgeBaseId: string, file: File): Observable<DocumentSummary> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<DocumentSummary>(
      `${API_BASE}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/upload`,
      formData,
    );
  }

  reprocessDocument(documentId: string): Observable<DocumentSummary> {
    return this.http.post<DocumentSummary>(
      `${API_BASE}/knowledge-bases/documents/${encodeURIComponent(documentId)}/reprocess`,
      {},
    );
  }

  deleteDocument(documentId: string): Observable<{ deletedDocumentId: string }> {
    return this.http.delete<{ deletedDocumentId: string }>(
      `${API_BASE}/knowledge-bases/documents/${encodeURIComponent(documentId)}`,
    );
  }

  searchKnowledgeBase(
    knowledgeBaseId: string,
    query: string,
    topK = 5,
    threshold = 0.2,
  ): Observable<KnowledgeSearchResult[]> {
    return this.http.post<KnowledgeSearchResult[]>(
      `${API_BASE}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/search`,
      { query, topK, threshold },
    );
  }

  askKnowledgeBaseQuestion(
    knowledgeBaseId: string,
    payload: KnowledgeBaseChatRequest,
  ): Observable<KnowledgeBaseChatResponse> {
    return this.http.post<KnowledgeBaseChatResponse>(
      `${API_BASE}/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/chat`,
      payload,
    );
  }
}
