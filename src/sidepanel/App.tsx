import { FormEvent, useRef, useState } from 'react';

type Role = 'user' | 'assistant';

type Message = {
  id: number;
  role: Role;
  text: string;
  isError?: boolean;
};

type BackgroundChatRequest = {
  type: 'chat:complete';
  payload: {
    messages: ChromeChatMessage[];
  };
};

type BackgroundChatResponse = {
  message?: string;
  error?: string;
};

type ChromeChatMessage = {
  role: Role | 'system';
  content: string;
};

const systemPrompt: ChromeChatMessage = {
  role: 'system',
  content: 'Tu es Cometi, un assistant de discussion sympathique et utile qui répond en français.',
};

const starterMessages: Message[] = [
  {
    id: 0,
    role: 'assistant',
    text: 'Salut ! Je suis Cometi, ravi de discuter avec toi. Pose-moi une question ou lance un sujet.',
  },
];

export function App(): JSX.Element {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const idRef = useRef(starterMessages.length - 1);

  const getNextMessageId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  const appendAssistantMessage = (text: string, options?: { isError?: boolean }) => {
    const assistantMessage: Message = {
      id: getNextMessageId(),
      role: 'assistant',
      text,
      isError: options?.isError,
    };
    setMessages((prev) => [...prev, assistantMessage]);
  };

  const requestAssistantReply = async (history: Message[]) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error("L'API Chrome n'est pas disponible. Charge l'extension dans Chrome pour discuter avec Cometi.");
    }

    const payloadMessages: ChromeChatMessage[] = [
      systemPrompt,
      ...history.map<ChromeChatMessage>((message) => ({
        role: message.role,
        content: message.text,
      })),
    ];

    const request: BackgroundChatRequest = {
      type: 'chat:complete',
      payload: { messages: payloadMessages },
    };

    return new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage(request, (response?: BackgroundChatResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error('Réponse vide du service d’arrière-plan.'));
          return;
        }

        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        if (typeof response.message !== 'string' || response.message.trim().length === 0) {
          reject(new Error('Réponse invalide du service d’arrière-plan.'));
          return;
        }

        resolve(response.message.trim());
      });
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: getNextMessageId(),
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
            error instanceof Error ? error.message : "Une erreur inattendue est survenue lors de l'appel à OpenAI.";
          appendAssistantMessage(message, { isError: true });
        })
        .finally(() => {
          setIsLoading(false);
        });

      return nextHistory;
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 backdrop-blur">
        <h1 className="text-lg font-semibold">Cometi</h1>
        <p className="text-xs text-slate-400">Ton compagnon de discussion dans le panneau latéral.</p>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                message.role === 'user'
                  ? 'bg-indigo-500 text-white'
                  : message.isError
                  ? 'bg-rose-500/10 text-rose-200 border border-rose-500/40'
                  : 'bg-slate-800 text-slate-100 border border-slate-700'
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm bg-slate-800 text-slate-100 border border-slate-700">
              Cometi réfléchit…
            </div>
          </div>
        )}
      </main>

      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Écris ton message..."
            rows={2}
            className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 shadow-inner placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 disabled:opacity-60"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow transition disabled:cursor-not-allowed disabled:opacity-70 hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {isLoading ? 'En cours…' : 'Envoyer'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
