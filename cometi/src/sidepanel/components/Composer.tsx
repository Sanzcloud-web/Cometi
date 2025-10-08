import type { FormEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ArrowRightIcon } from './icons';
import { SlashCommandMenu, SlashCommand } from './SlashCommandMenu';
import { SLASH_COMMANDS } from '../commands';
import { SuggestionsTray } from './SuggestionsTray';
import type { Suggestion } from '../types/suggestions';

type ComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  suggestions: Suggestion[];
  areSuggestionsLoading: boolean;
  areSuggestionsRefreshing?: boolean;
  suggestionsError?: string;
  onRefreshSuggestions?: () => void;
  onSuggestionSelected?: (suggestion: Suggestion) => void;
};

export function Composer({
  draft,
  onDraftChange,
  onSubmit,
  isSubmitting,
  suggestions,
  areSuggestionsLoading,
  areSuggestionsRefreshing,
  suggestionsError,
  onRefreshSuggestions,
  onSuggestionSelected,
}: ComposerProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSlashOpen, setIsSlashOpen] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);

  const adjustTextareaSize = (textarea: HTMLTextAreaElement) => {
    const MAX_HEIGHT = 192; // ~12rem
    const BASE_HEIGHT = 44; // 2.75rem, align with min-h in Textarea
    // For empty input, force baseline height to avoid initial oversize
    if (textarea.value.trim().length === 0) {
      textarea.style.height = `${BASE_HEIGHT}px`;
      textarea.style.overflowY = 'hidden';
      return;
    }
    // Measure natural content height
    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, BASE_HEIGHT), MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > nextHeight ? 'auto' : 'hidden';
  };

  // Measure before paint to avoid flicker
  useLayoutEffect(() => {
    if (textareaRef.current) {
      adjustTextareaSize(textareaRef.current);
    }
  }, [draft]);

  const currentValue = draft;
  const isSlashContext = currentValue.startsWith('/');
  const slashToken = (() => {
    if (!isSlashContext) return '';
    const withoutSlash = currentValue.slice(1);
    const end = withoutSlash.search(/\s|\n/);
    return (end === -1 ? withoutSlash : withoutSlash.slice(0, end)).trim();
  })();
  const slashItems: SlashCommand[] = SLASH_COMMANDS.filter((c) => {
    const q = slashToken.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q);
  });

  useEffect(() => {
    setIsSlashOpen(isSlashContext);
    setSlashActiveIndex(0);
  }, [isSlashContext, slashToken]);

  const applySlashSelection = (cmd: SlashCommand, submit?: boolean) => {
    const next = cmd.value;
    onDraftChange(next);
    setIsSlashOpen(false);
    // Restore focus and optionally submit
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      if (submit) {
        textareaRef.current?.form?.requestSubmit();
      }
    });
  };

  const showSuggestions = draft.trim().length === 0;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[#C7CDCD] bg-[#FCFCF9] p-3 shadow-sm"
    >
      <div className="flex flex-col gap-3">
        <div
          className={[
            'overflow-hidden transition-all duration-300',
            showSuggestions ? 'max-h-40 opacity-100 mt-0' : 'max-h-0 opacity-0 -mt-2 pointer-events-none',
          ].join(' ')}
          aria-hidden={!showSuggestions}
        >
          <SuggestionsTray
            suggestions={suggestions}
            isLoading={areSuggestionsLoading}
            isRefreshing={areSuggestionsRefreshing}
            error={suggestionsError}
            onRetry={onRefreshSuggestions}
            onSelect={(suggestion) => {
              if (onSuggestionSelected) {
                onSuggestionSelected(suggestion);
                return;
              }
              onDraftChange(suggestion.label);
              requestAnimationFrame(() => {
                if (textareaRef.current) {
                  textareaRef.current.focus();
                  adjustTextareaSize(textareaRef.current);
                }
              });
            }}
          />
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                const next = event.target.value;
                onDraftChange(next);
                adjustTextareaSize(event.currentTarget);
                // toggle slash menu based on new content
                setIsSlashOpen(next.startsWith('/'));
              }}
              rows={1}
              placeholder="Écrire un message…"
              variant="plain"
              className="max-h-64 w-full leading-relaxed"
              disabled={isSubmitting}
              onKeyDown={(event) => {
                if (isSlashOpen) {
                  // navigation for slash menu
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setSlashActiveIndex((idx) => (slashItems.length ? (idx + 1) % slashItems.length : 0));
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setSlashActiveIndex((idx) => (slashItems.length ? (idx - 1 + slashItems.length) % slashItems.length : 0));
                    return;
                  }
                  if (event.key === 'Tab') {
                    event.preventDefault();
                    if (slashItems.length) applySlashSelection(slashItems[slashActiveIndex], false);
                    return;
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    if (slashItems.length) {
                      event.preventDefault();
                      applySlashSelection(slashItems[slashActiveIndex], true);
                      return;
                    }
                    // no items -> close and let normal enter handling run below
                    setIsSlashOpen(false);
                    // do not return; fall through to normal submit handler
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setIsSlashOpen(false);
                    return;
                  }
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!isSubmitting && event.currentTarget.value.trim().length > 0) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
              // Set an initial height to prevent first-render jump
              style={{ overflowY: 'hidden', height: 44 }}
            />
          </div>
          <SlashCommandMenu
            open={isSlashOpen}
            items={slashItems}
            activeIndex={slashActiveIndex}
            onActiveIndexChange={setSlashActiveIndex}
            anchor={textareaRef.current}
            onClose={() => setIsSlashOpen(false)}
            onSelect={(cmd) => applySlashSelection(cmd, true)}
          />
          <Button
            type="submit"
            aria-label="Envoyer le message"
            disabled={isSubmitting || draft.trim().length === 0}
            variant="brand"
            className="h-10 w-10 rounded-full"
          >
            <ArrowRightIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </form>
  );
}
