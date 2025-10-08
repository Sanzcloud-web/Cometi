import type { Suggestion } from '../types/suggestions';
import { cx } from '../utils/cx';
import { Button } from './ui/button';

const PLACEHOLDER_ITEMS = Array.from({ length: 3 });

const CHIP_CLASS = cx(
  'rounded-full border border-[#C7CDCD] bg-[#FCFCF9] px-4 py-1.5 text-sm font-medium text-slate-700 transition',
  'hover:border-[#C7CDCD] hover:bg-[#FCFCF9]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FCFCF9]'
);
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
  const isBusy = isLoading || Boolean(isRefreshing);
  const placeholderCount = suggestions.length > 0 ? suggestions.length : PLACEHOLDER_ITEMS.length;
  const hasContent = isBusy || suggestions.length > 0 || Boolean(error);

  if (!hasContent) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-live="polite"
      aria-busy={isLoading || isRefreshing}
    >
      {isBusy
        ? Array.from({ length: placeholderCount }).map((_, index) => (
            <span
              key={`placeholder-${index}`}
              className="h-8 w-32 animate-pulse rounded-full bg-slate-100"
              aria-hidden
            />
          ))
        : suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onSelect(suggestion)}
              className={CHIP_CLASS}
              aria-label={`Exécuter la suggestion « ${suggestion.label} »`}
            >
              {suggestion.label}
            </button>
          ))}

      {Boolean(error) ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span role="status">{error}</span>
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
