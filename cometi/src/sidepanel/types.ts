export type Role = 'user' | 'assistant';

export type ChromeChatMessage = {
  role: Role | 'system';
  content: string;
};

export type ConversationMessage = {
  id: number;
  role: Role;
  text: string;
  isError?: boolean;
};
