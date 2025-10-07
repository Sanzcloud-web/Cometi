export type Role = 'user' | 'assistant';

export type ChromeChatMessage = {
  role: Role | 'system';
  content: string;
};

export type MessageAction =
  | {
      type: 'copy';
      label: string;
      value: string;
    }
  | {
      type: 'open';
      label: string;
      url: string;
    };

export type ConversationMessage = {
  id: number;
  role: Role;
  text: string;
  isError?: boolean;
  actions?: MessageAction[];
};
