import type { ConversationMessage } from '../types/chat';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';
import { useEffect, useRef } from 'react';

type ConversationThreadProps = {
  messages: ConversationMessage[];
  isLoading: boolean;
};

export function ConversationThread({ messages, isLoading }: ConversationThreadProps): JSX.Element {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col gap-4 pb-6">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {isLoading ? <TypingIndicator /> : null}
      <div ref={endRef} />
    </div>
  );
}
