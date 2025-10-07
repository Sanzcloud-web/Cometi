import { useMemo } from 'react';
import { useConversation } from './hooks/useConversation';
import { AppHeader } from './components/AppHeader';
import { ResponseTabs } from './components/ResponseTabs';
import { ConversationThread } from './components/ConversationThread';
import { Composer } from './components/Composer';
import type { ConversationMessage } from './types/chat';

function getLatestUserPrompt(messages: ConversationMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') {
      return message.text;
    }
  }
  return null;
}

export function App(): JSX.Element {
  const { messages, draft, setDraft, isLoading, handleSubmit } = useConversation();

  const latestPrompt = useMemo(() => getLatestUserPrompt(messages), [messages]);

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <AppHeader />

      <main className="flex-1 overflow-hidden px-4 py-6 sm:px-6">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6">
          <ResponseTabs />
          <div className="relative flex-1 overflow-y-auto pr-1">
            <ConversationThread messages={messages} isLoading={isLoading} />
          </div>
        </div>
      </main>

      <Composer draft={draft} onDraftChange={setDraft} onSubmit={handleSubmit} isSubmitting={isLoading} />
    </div>
  );
}

export default App;
