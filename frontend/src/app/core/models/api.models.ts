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

export interface OneOffChatResponse {
  model: string;
  response: string;
}
