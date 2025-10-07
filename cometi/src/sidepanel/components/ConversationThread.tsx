import type { ConversationMessage } from '../types/chat';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';

type ConversationThreadProps = {
  messages: ConversationMessage[];
  isLoading: boolean;
};

export function ConversationThread({ messages, isLoading }: ConversationThreadProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4 pb-6">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {isLoading ? <TypingIndicator /> : null}
    </div>
  );
}
