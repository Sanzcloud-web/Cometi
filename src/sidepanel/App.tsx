import { FormEvent, useState } from 'react';

type Role = 'user' | 'assistant';

type Message = {
  id: number;
  role: Role;
  text: string;
};

const starterMessages: Message[] = [
  {
    id: 0,
    role: 'assistant',
    text: 'Salut ! Je suis ton compagnon de discussion. Pose-moi une question ou raconte-moi ta journée !',
  },
];

const assistantReplies = [
  "Intéressant ! Peux-tu m'en dire un peu plus ?",
  "Merci pour ce partage. Comment te sens-tu par rapport à ça ?",
  "Je vois ! Si tu pouvais changer quelque chose, ce serait quoi ?",
  "D'accord, continuons. Quelle est la suite ?",
];

function getAssistantReply(index: number, userText: string): string {
  const reply = assistantReplies[index % assistantReplies.length];
  return `${reply}\n\n(Tu as dit : \"${userText}\".)`;
}

export function App(): JSX.Element {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [draft, setDraft] = useState('');
  const [messageCount, setMessageCount] = useState(starterMessages.length);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) {
      return;
    }

    setMessages((prev) => {
      const userMessage: Message = {
        id: messageCount,
        role: 'user',
        text: content,
      };
      const assistantMessage: Message = {
        id: messageCount + 1,
        role: 'assistant',
        text: getAssistantReply(messageCount, content),
      };
      return [...prev, userMessage, assistantMessage];
    });

    setMessageCount((count) => count + 2);
    setDraft('');
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
                  : 'bg-slate-800 text-slate-100 border border-slate-700'
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
      </main>

      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Écris ton message..."
            rows={2}
            className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 shadow-inner placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            Envoyer
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
