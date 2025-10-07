import { useConversation } from './hooks/useConversation';
import { ConversationThread } from './components/ConversationThread';
import { Composer } from './components/Composer';
import { ScrollArea } from './components/ui/scroll-area';
import { useSuggestions } from './hooks/useSuggestions';

export function App(): JSX.Element {
  const { messages, draft, setDraft, isLoading, handleSubmit, runPrompt } = useConversation();
  const {
    suggestions,
    isLoading: areSuggestionsLoading,
    isRefreshing: areSuggestionsRefreshing,
    error: suggestionsError,
    refresh,
  } = useSuggestions();

  return (
    <div className="flex h-screen w-full justify-center px-2 py-2 sm:px-6">
      <div className="flex h-full w-full max-w-2xl flex-col gap-4">
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
  );
}

export default App;
