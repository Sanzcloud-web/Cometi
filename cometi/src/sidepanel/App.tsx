import { useConversation } from './hooks/useConversation';
import { ConversationThread } from './components/ConversationThread';
import { Composer } from './components/Composer';
import { ScrollArea } from './components/ui/scroll-area';
import { Card } from './components/ui/card';

export function App(): JSX.Element {
  const { messages, draft, setDraft, isLoading, handleSubmit } = useConversation();

  return (
    <div className="flex h-screen w-full justify-center">
      <div className="flex h-full w-full max-w-2xl flex-col">
        <Card className="flex-1 overflow-hidden border-slate-200 bg-white">
          <ScrollArea className="h-full">
            <ConversationThread messages={messages} isLoading={isLoading} />
          </ScrollArea>
        </Card>
        <Composer draft={draft} onDraftChange={setDraft} onSubmit={handleSubmit} isSubmitting={isLoading} />
      </div>
    </div>
  );
}

export default App;
