import type { Suggestion } from '../types/suggestions';
import { Button } from './ui/button';

const PLACEHOLDER_ITEMS = Array.from({ length: 3 });

type SuggestionsTrayProps = {
  suggestions: Suggestion[];
  isLoading: boolean;
  isRefreshing?: boolean;
  error?: string;
  onSelect: (suggestion: Suggestion) => void;
  onRetry?: () => void;
};

export function SuggestionsTray({
  suggestions,
  isLoading,
  isRefreshing,
  error,
  onSelect,
  onRetry,
}: SuggestionsTrayProps): JSX.Element | null {
  const showPlaceholder = isLoading && suggestions.length === 0;
  const hasContent = showPlaceholder || suggestions.length > 0 || Boolean(error);

  if (!hasContent) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
        >
          {suggestion.label}
        </button>
      ))}

      {showPlaceholder
        ? PLACEHOLDER_ITEMS.map((_, index) => (
            <span
              key={`placeholder-${index}`}
              className="h-8 w-32 animate-pulse rounded-full bg-slate-100"
              aria-hidden
            />
          ))
        : null}

      {isRefreshing && suggestions.length > 0 ? (
        <span className="text-xs font-medium text-slate-400">Actualisation…</span>
      ) : null}

      {Boolean(error) ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>{error}</span>
          {onRetry ? (
            <Button type="button" variant="ghost" onClick={onRetry} className="h-7 rounded-full px-3 text-xs">
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
