import { FormEvent, useRef, useState } from 'react';
import { requestChatCompletion, requestChatCompletionStream } from '../services/chatClient';
import { requestResumeSummary } from '../services/resumeCommand';
import { requestResumeSummaryStream, extractSummaryPreview } from '../services/resumeStream';
import type { ChromeChatMessage, ConversationMessage, MessageAction } from '../types/chat';
import type { ResumeSummary } from '../types/resume';

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

  const appendAssistantMessage = (
    text: string,
    options?: { isError?: boolean; actions?: MessageAction[] }
  ): number => {
    const assistantMessage: ConversationMessage = {
      id: getNextId(),
      role: 'assistant',
      text,
      isError: options?.isError,
      actions: options?.actions,
    };
    setMessages((prev) => [...prev, assistantMessage]);
    return assistantMessage.id;
  };

  const updateAssistantMessage = (
    id: number,
    text: string,
    options?: { isError?: boolean; actions?: MessageAction[] }
  ) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id
          ? {
              ...message,
              text,
              isError: options?.isError,
              actions: options?.actions,
            }
          : message
      )
    );
  };

  const formatResumeSummary = (summary: ResumeSummary): { text: string; actions: MessageAction[] } => {
    const header = summary.title ? `${summary.title}\n\n` : '';
    const bullets = summary.tldr.map((item) => `• ${item}`).join('\n');
    const sources = summary.usedSources.map((source, index) => `• Source ${index + 1} : ${source}`).join('\n');
    const text =
      `${header}TL;DR\n${bullets}\n\nRésumé\n${summary.summary}\n\nSources\n${sources}`.trim();

    const actions: MessageAction[] = [
      {
        type: 'copy',
        label: 'Copier le résumé',
        value: text,
      },
      ...summary.usedSources.map<MessageAction>((source, index) => ({
        type: 'open',
        label: `Ouvrir source ${index + 1}`,
        url: source,
      })),
    ];

    return { text, actions };
  };

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
        { id: placeholderId, role: 'assistant', text: 'Analyse du contenu de la page en cours…' },
      ]);

      void (async () => {
        try {
          let acc = '';
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
              const preview = extractSummaryPreview(acc);
              if (preview && preview.trim().length > 0) {
                updateAssistantMessage(placeholderId, preview);
              }
            },
          });
          const formatted = formatResumeSummary(summary);
          updateAssistantMessage(placeholderId, formatted.text, { actions: formatted.actions });
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
    const placeholderId = appendAssistantMessage('');
    let acc = '';

    void requestAssistantReply([...messages, userMessage], (delta) => {
      acc += delta;
      updateAssistantMessage(placeholderId, acc);
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
