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
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <AppHeader />

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          <ResponseTabs />
          <ConversationThread messages={messages} isLoading={isLoading} />
        </div>
      </main>

      <Composer draft={draft} onDraftChange={setDraft} onSubmit={handleSubmit} isSubmitting={isLoading} />
    </div>
  );
}

export default App;
