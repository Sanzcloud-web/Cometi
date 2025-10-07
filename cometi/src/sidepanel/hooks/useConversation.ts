import { FormEvent, useRef, useState } from 'react';
import { requestChatCompletion } from '../services/chatClient';
import type { ChromeChatMessage, ConversationMessage } from '../types/chat';

const SYSTEM_PROMPT: ChromeChatMessage = {
  role: 'system',
  content: 'Tu es Cometi, un assistant de discussion attentif et serviable qui répond en français avec clarté.',
};

const STARTER_MESSAGES: ConversationMessage[] = [
  {
    id: 0,
    role: 'assistant',
    text: 'Salut ! Je suis Cometi, prêt à t\'aider. Que souhaites-tu explorer aujourd\'hui ?',
  },
];

export function useConversation() {
  const [messages, setMessages] = useState<ConversationMessage[]>(STARTER_MESSAGES);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const idCounterRef = useRef(STARTER_MESSAGES.length - 1);

  const getNextId = () => {
    idCounterRef.current += 1;
    return idCounterRef.current;
  };

  const appendAssistantMessage = (text: string, options?: { isError?: boolean }) => {
    const assistantMessage: ConversationMessage = {
      id: getNextId(),
      role: 'assistant',
      text,
      isError: options?.isError,
    };
    setMessages((prev) => [...prev, assistantMessage]);
  };

  const requestAssistantReply = async (history: ConversationMessage[]) => {
    const payloadMessages: ChromeChatMessage[] = [
      SYSTEM_PROMPT,
      ...history.map<ChromeChatMessage>((message) => ({
        role: message.role,
        content: message.text,
      })),
    ];

    return requestChatCompletion(payloadMessages);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isLoading) {
      return;
    }

    const userMessage: ConversationMessage = {
      id: getNextId(),
      role: 'user',
      text: content,
    };

    setDraft('');
    setIsLoading(true);

    setMessages((prev) => {
      const nextHistory = [...prev, userMessage];
      void requestAssistantReply(nextHistory)
        .then((assistantReply) => {
          appendAssistantMessage(assistantReply);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "Une erreur inattendue est survenue lors de l'appel au backend Cometi.";
          appendAssistantMessage(message, { isError: true });
        })
        .finally(() => {
          setIsLoading(false);
        });

      return nextHistory;
    });
  };

  return {
    messages,
    draft,
    setDraft,
    isLoading,
    handleSubmit,
  };
}
