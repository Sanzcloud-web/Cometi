import { useEffect, useRef } from 'react';
import type { ConversationMessage } from '../types/chat';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';

type ConversationThreadProps = {
  messages: ConversationMessage[];
  isLoading: boolean;
};

export function ConversationThread({ messages, isLoading }: ConversationThreadProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    const lastItem = container.lastElementChild as HTMLElement | null;
    lastItem?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  return (
    <div ref={listRef} className="flex flex-col gap-4">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {isLoading ? <TypingIndicator /> : null}
    </div>
  );
}
