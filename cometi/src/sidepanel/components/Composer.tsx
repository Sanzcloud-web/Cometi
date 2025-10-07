import type { FormEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { PaperAirplaneIcon } from './icons';
import { SlashCommandMenu, SlashCommand } from './SlashCommandMenu';
import { SLASH_COMMANDS } from '../commands';

type ComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
};

export function Composer({ draft, onDraftChange, onSubmit, isSubmitting }: ComposerProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSlashOpen, setIsSlashOpen] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);

  const adjustTextareaSize = (textarea: HTMLTextAreaElement) => {
    const MAX_HEIGHT = 192; // ~12rem
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > nextHeight ? 'auto' : 'hidden';
  };

  // Measure before paint to avoid initial oversize flicker
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

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
    >
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
        className="max-h-64 flex-1 leading-relaxed"
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
        className="h-10 w-10 rounded-full bg-slate-900 text-white hover:bg-slate-800"
      >
        <PaperAirplaneIcon className="h-4 w-4" />
      </Button>
    </form>
  );
}
