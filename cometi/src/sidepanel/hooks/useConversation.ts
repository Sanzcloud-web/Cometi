import { FormEvent, useEffect, useRef, useState } from 'react';
import { requestChatCompletion, requestChatCompletionStream } from '../services/chatClient';
import { requestResumeSummaryStream } from '../services/resumeStream';
import { requestPageAnswerStream, requestResumeContext } from '../services/pageAnswerStream';
import type { ChromeChatMessage, ConversationMessage, MessageAction } from '../types/chat';
import { MARKDOWN_GUIDELINES_FR } from '../../shared/markdownGuidelines';
import { createChat as apiCreateChat, listChats as apiListChats, loadChat as apiLoadChat, type ChatSummary } from '../services/historyClient';

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
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
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

  const refreshChats = async () => {
    try {
      const list = await apiListChats();
      setChats(list);
    } catch {
      // ignore if backend not available
    }
  };

  const createNewChat = async () => {
    try {
      const chat = await apiCreateChat();
      setChatId(chat.id);
      setMessages(STARTER_MESSAGES);
      idCounterRef.current = STARTER_MESSAGES.length - 1;
      await refreshChats();
    } catch {
      // Backend not available; keep in-memory only
      setChatId(undefined);
      setMessages(STARTER_MESSAGES);
      idCounterRef.current = STARTER_MESSAGES.length - 1;
    }
  };

  const openChat = async (id: string) => {
    try {
      const data = await apiLoadChat(id);
      setChatId(data.id);
      // Convert loaded messages to ConversationMessage with incremental ids
      const base: ConversationMessage[] = [];
      let nextId = -1;
      const push = (role: 'user' | 'assistant', text: string) => {
        nextId += 1;
        base.push({ id: nextId, role, text });
      };
      // Always start with our intro assistant message
      nextId = 0;
      const intro = STARTER_MESSAGES[0];
      base.push({ ...intro });
      for (const m of data.messages) {
        if (m.role === 'user' || m.role === 'assistant') {
          push(m.role, m.text);
        }
      }
      setMessages(base);
      idCounterRef.current = base.length - 1;
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    // On mount: create a new chat session
    void createNewChat();
    void refreshChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      return requestChatCompletionStream(payloadMessages, onStream, { chatId });
    }
    return requestChatCompletion(payloadMessages, { chatId });
  };

  const runPrompt = (rawContent: string, options?: { enforcePageContext?: boolean }) => {
    const content = rawContent.trim();
    if (!content || isLoading) {
      return;
    }

    const enforcePageContext = options?.enforcePageContext ?? false;
    const userMessage: ConversationMessage = {
      id: getNextId(),
      role: 'user',
      text: content,
    };

    setDraft('');
    setIsLoading(true);

    const isResumeCommand = content === '/resume' && !enforcePageContext;

    if (isResumeCommand) {
      const placeholderId = getNextId();
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
              .replace(/(^|\n)(#{1,6})(\S)/g, (_m, p1, p2, p3) => `${p1}${p2} ${p3}`)
              .replace(/(^|\n)-(\S)/g, (_m, p1, p2) => `${p1}- ${p2}`);
          const summary = await requestResumeSummaryStream({
            onProgress: (e) => {
              const label = typeof (e as any)?.text === 'string'
                ? (e as any).text
                : typeof e?.stage === 'string'
                  ? e.stage
                  : undefined;
              if (label) {
                updateAssistantMessage(placeholderId, label, { isLoading: true });
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

    setMessages((prev) => [...prev, userMessage]);
    const placeholderId = appendAssistantMessage('', { isLoading: true });

    void (async () => {
      try {
        if (enforcePageContext) {
          let acc = '';
          const answer = await requestPageAnswerStream(content, {
            onDelta: (delta) => {
              acc += delta;
              updateAssistantMessage(placeholderId, acc, { isLoading: false });
            },
            onProgress: (e) => {
              const label = typeof (e as any)?.text === 'string'
                ? (e as any).text
                : typeof e?.stage === 'string'
                  ? e.stage
                  : undefined;
              if (label) {
                updateAssistantMessage(placeholderId, label, { isLoading: true });
              }
            },
          });
          updateAssistantMessage(placeholderId, answer);
          return;
        }

        const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');
        const hasApi = API_BASE.length > 0;
        let usePage = false;
        if (hasApi) {
          let pageUrl = '';
          try {
            const ctx = await requestResumeContext();
            pageUrl = ctx.url;
          } catch { /* ignore */ }
          const routerSystem: ChromeChatMessage = {
            role: 'system',
            content:
              `Tu es un routeur. Page courante: ${pageUrl}. Si la question a besoin du CONTENU de cette page pour répondre précisément (ou si la requête y fait implicitement référence), réponds UNIQUEMENT par <USE_PAGE_CONTEXT/>. Sinon réponds UNIQUEMENT par <NO_PAGE_CONTEXT/>.`,
          };
        const decision = await requestChatCompletion([routerSystem, { role: 'user', content }], { chatId });
        usePage = /<USE_PAGE_CONTEXT\/>/i.test(decision);
      }

        if (usePage) {
          let acc = '';
          const answer = await requestPageAnswerStream(content, {
            onDelta: (delta) => {
              acc += delta;
              updateAssistantMessage(placeholderId, acc, { isLoading: false });
            },
            onProgress: (e) => {
              const label = typeof (e as any)?.text === 'string'
                ? (e as any).text
                : typeof e?.stage === 'string'
                  ? e.stage
                  : undefined;
              if (label) {
                updateAssistantMessage(placeholderId, label, { isLoading: true });
              }
            },
          });
          updateAssistantMessage(placeholderId, answer);
          return;
        }

        let acc = '';
        let first = true;
        await requestAssistantReply([...messages, userMessage], (delta) => {
          acc += delta;
          if (first) {
            first = false;
            updateAssistantMessage(placeholderId, acc, { isLoading: false });
          } else {
            updateAssistantMessage(placeholderId, acc);
          }
        }).then((finalText) => {
          updateAssistantMessage(placeholderId, finalText);
        });
        void refreshChats();
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Une erreur inattendue est survenue lors de l'appel au backend Cometi.";
        updateAssistantMessage(placeholderId, message, { isError: true });
      } finally {
        setIsLoading(false);
      }
    })();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runPrompt(draft);
  };

  return {
    messages,
    draft,
    setDraft,
    isLoading,
    handleSubmit,
    runPrompt,
    chatId,
    chats,
    historyOpen,
    setHistoryOpen,
    createNewChat,
    openChat,
  };
}
