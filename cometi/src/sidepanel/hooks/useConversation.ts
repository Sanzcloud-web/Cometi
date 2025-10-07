import { FormEvent, useRef, useState } from 'react';
import { requestChatCompletion, requestChatCompletionStream } from '../services/chatClient';
import { requestResumeSummaryStream } from '../services/resumeStream';
import type { ChromeChatMessage, ConversationMessage, MessageAction } from '../types/chat';
import { MARKDOWN_GUIDELINES_FR } from '../../shared/markdownGuidelines';

const SYSTEM_PROMPT: ChromeChatMessage = {
  role: 'system',
  content: [
    'Tu es Cometi, un assistant de discussion attentif et serviable qui répond en français avec clarté.',
    'Réponds en Markdown (GFM) et structure tes réponses pour une lecture facile.',
    MARKDOWN_GUIDELINES_FR,
  ].join('\n\n'),
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

  const appendAssistantMessage = (
    text: string,
    options?: { isError?: boolean; actions?: MessageAction[]; isLoading?: boolean }
  ): number => {
    const assistantMessage: ConversationMessage = {
      id: getNextId(),
      role: 'assistant',
      text,
      isError: options?.isError,
      actions: options?.actions,
      isLoading: options?.isLoading,
    };
    setMessages((prev) => [...prev, assistantMessage]);
    return assistantMessage.id;
  };

  const updateAssistantMessage = (
    id: number,
    text: string,
    options?: { isError?: boolean; actions?: MessageAction[]; isLoading?: boolean }
  ) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id
          ? {
            ...message,
            text,
            isError: options?.isError,
            actions: options?.actions,
            isLoading: options?.isLoading ?? message.isLoading,
          }
          : message
      )
    );
  };

  // No JSON formatting; we stream and render plain text directly.

  const requestAssistantReply = async (history: ConversationMessage[], onStream?: (delta: string) => void) => {
    const payloadMessages: ChromeChatMessage[] = [
      SYSTEM_PROMPT,
      ...history.map<ChromeChatMessage>((message) => ({
        role: message.role,
        content: message.text,
      })),
    ];

    if (onStream) {
      return requestChatCompletionStream(payloadMessages, onStream);
    }
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

    const isResumeCommand = content === '/resume';

    if (isResumeCommand) {
      const placeholderId = getNextId();
      // Append both user message and placeholder in a single state update
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: placeholderId, role: 'assistant', text: '', isLoading: true },
      ]);

      void (async () => {
        try {
          let acc = '';
          let first = true;
          const normalizeMd = (s: string) =>
            s
              // Ensure space after markdown headers like ##Title -> ## Title
              .replace(/(^|\n)(#{1,6})(\S)/g, (_m, p1, p2, p3) => `${p1}${p2} ${p3}`)
              // Ensure dash-space for lists: -Item -> - Item
              .replace(/(^|\n)-(\S)/g, (_m, p1, p2) => `${p1}- ${p2}`);
          const summary = await requestResumeSummaryStream({
            onProgress: (e) => {
              // Optionally reflect stage in UI in the future
              // For now we keep the base text and let deltas replace it progressively
              if (e?.stage && typeof e.stage === 'string') {
                // noop; could do: updateAssistantMessage(placeholderId, `(${e.stage})\n\n` + acc)
              }
            },
            onDelta: (delta) => {
              acc += delta;
              const view = normalizeMd(acc);
              if (first) {
                first = false;
                updateAssistantMessage(placeholderId, view, { isLoading: false });
              } else {
                updateAssistantMessage(placeholderId, view);
              }
            },
          });
          const finalText = normalizeMd(summary);
          const actions: MessageAction[] = [{ type: 'copy', label: 'Copier le résumé', value: finalText }];
          updateAssistantMessage(placeholderId, finalText, { actions });
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : 'Impossible de produire le résumé de la page active.';
          updateAssistantMessage(placeholderId, message, { isError: true });
        } finally {
          setIsLoading(false);
        }
      })();

      return;
    }

    // Regular chat flow
    // Streaming chat flow
    setMessages((prev) => [...prev, userMessage]);
    const placeholderId = appendAssistantMessage('', { isLoading: true });
    let acc = '';
    let first = true;

    void requestAssistantReply([...messages, userMessage], (delta) => {
      acc += delta;
      if (first) {
        first = false;
        updateAssistantMessage(placeholderId, acc, { isLoading: false });
      } else {
        updateAssistantMessage(placeholderId, acc);
      }
    })
      .then((finalText) => {
        updateAssistantMessage(placeholderId, finalText);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Une erreur inattendue est survenue lors de l'appel au backend Cometi.";
        updateAssistantMessage(placeholderId, message, { isError: true });
      })
      .finally(() => {
        setIsLoading(false);
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
