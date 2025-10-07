import type { ConversationMessage } from '../types/chat';
import { MessageItem } from './MessageItem';

type ConversationThreadProps = {
  messages: ConversationMessage[];
  isLoading: boolean;
};

export function ConversationThread({ messages }: ConversationThreadProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4 pb-6">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
}
