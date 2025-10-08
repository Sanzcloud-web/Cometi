import { useConversation } from './hooks/useConversation';
import { ConversationThread } from './components/ConversationThread';
import { Composer } from './components/Composer';
import { ScrollArea } from './components/ui/scroll-area';
import { useSuggestions } from './hooks/useSuggestions';
import { Button } from './components/ui/button';
import { HistorySidebar } from './components/HistorySidebar';

export function App(): JSX.Element {
  const { messages, draft, setDraft, isLoading, handleSubmit, runPrompt, chats, historyOpen, setHistoryOpen, createNewChat, openChat } = useConversation();
  const {
    suggestions,
    isLoading: areSuggestionsLoading,
    isRefreshing: areSuggestionsRefreshing,
    error: suggestionsError,
    refresh,
  } = useSuggestions();

  return (
    <div className="flex h-screen w-full justify-center px-2 py-2 sm:px-6">
      <div className="flex h-full w-full max-w-2xl flex-row gap-3">
        <HistorySidebar isOpen={historyOpen} chats={chats} onSelect={(id) => { openChat(id); setHistoryOpen(false); }} onClose={() => setHistoryOpen(false)} />
        <div className="flex h-full flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setHistoryOpen((v) => !v)} className="h-8 px-3 text-sm">{historyOpen ? 'Masquer' : 'Historique'}</Button>
            </div>
            <div>
              <Button type="button" onClick={() => { void createNewChat(); }} className="h-8 px-3 text-sm">Nouveau chat</Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden rounded-xl bg-transparent">
            <ScrollArea className="h-full">
              <ConversationThread messages={messages} isLoading={isLoading} />
            </ScrollArea>
          </div>
          <Composer
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
          isSubmitting={isLoading}
          suggestions={suggestions}
          areSuggestionsLoading={areSuggestionsLoading}
          areSuggestionsRefreshing={areSuggestionsRefreshing}
          suggestionsError={suggestionsError}
          onRefreshSuggestions={refresh}
          onSuggestionSelected={(suggestion) => {
            runPrompt(suggestion.label, { enforcePageContext: true });
          }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
