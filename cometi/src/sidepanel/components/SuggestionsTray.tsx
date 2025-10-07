import type { Suggestion } from '../types/suggestions';
import { Button } from './ui/button';

const PLACEHOLDER_ITEMS = Array.from({ length: 3 });

type SuggestionsTrayProps = {
  suggestions: Suggestion[];
  isLoading: boolean;
  error?: string;
  onSelect: (suggestion: Suggestion) => void;
  onRetry?: () => void;
};

export function SuggestionsTray({ suggestions, isLoading, error, onSelect, onRetry }: SuggestionsTrayProps): JSX.Element | null {
  if (!isLoading && !error && suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isLoading
        ? PLACEHOLDER_ITEMS.map((_, index) => (
            <span
              key={`placeholder-${index}`}
              className="h-8 w-32 animate-pulse rounded-full bg-slate-100"
              aria-hidden
            />
          ))
        : null}

      {!isLoading && error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>{error}</span>
          {onRetry ? (
            <Button type="button" variant="ghost" onClick={onRetry} className="h-7 rounded-full px-3 text-xs">
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}

      {!isLoading && !error
        ? suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onSelect(suggestion)}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              {suggestion.label}
            </button>
          ))
        : null}
    </div>
  );
}
