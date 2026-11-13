export interface AuthUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  firstName: string | null;
  lastName: string | null;
}

export interface SessionResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  systemPrompt: string | null;
  configuration: unknown;
  isActive: boolean;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  metadata: unknown;
  tokenCount: number | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  userId: string;
  agentId: string | null;
  agent?: Agent | null;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageResponse {
  conversationId: string;
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
}

export interface SpeechTranscriptionResponse {
  text: string;
}

export interface SpeechVoice {
  id: string;
  language: string;
  label: string;
  isDefault: boolean;
}

export interface OneOffChatResponse {
  model: string;
  response: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  documents?: Array<{ id: string; status: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseWithDocuments extends KnowledgeBase {
  documents: DocumentSummary[];
}

export interface DocumentSummary {
  id: string;
  knowledgeBaseId: string;
  uploadedByUserId: string;
  originalFileName: string;
  storedFilePath: string;
  mimeType: string | null;
  fileSizeBytes: number;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
  extractedText: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSearchResult {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  similarityScore: number;
  metadata: Record<string, unknown> | null;
}

export interface AssistantSource {
  documentId: string;
  documentName: string;
  chunkId: string;
  chunkIndex: number;
  similarityScore: number;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface KnowledgeBaseChatRequest {
  question: string;
  topK?: number;
  threshold?: number;
}

export interface KnowledgeBaseChatResponse {
  answer: string;
  sources: AssistantSource[];
}

export interface UpdateKnowledgeBaseRequest {
  name: string;
  description?: string | null;
}
