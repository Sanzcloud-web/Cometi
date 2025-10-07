import type { FormEvent } from 'react';
import { useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { PaperAirplaneIcon } from './icons';

type ComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
};

export function Composer({ draft, onDraftChange, onSubmit, isSubmitting }: ComposerProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaSize = (textarea: HTMLTextAreaElement) => {
    const MAX_HEIGHT = 192; // ~12rem
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > nextHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    if (textareaRef.current) {
      adjustTextareaSize(textareaRef.current);
    }
  }, [draft]);

  return (
    <form
      onSubmit={onSubmit}
      className="group relative flex min-h-[4.5rem] items-end gap-3 rounded-xl border border-slate-200 bg-white p-3"
    >
      <Textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => {
          onDraftChange(event.target.value);
          adjustTextareaSize(event.currentTarget);
        }}
        rows={1}
        placeholder="Entrez votre message"
        className="max-h-64 flex-1 resize-none px-0 py-0 text-[0.95rem] leading-relaxed text-slate-800 placeholder:text-slate-400 "
        disabled={isSubmitting}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!isSubmitting && event.currentTarget.value.trim().length > 0) {
              event.currentTarget.form?.requestSubmit();
            }
          }
        }}
        style={{ overflowY: 'hidden' }}
      />
      <Button
        type="submit"
        aria-label="Envoyer le message"
        disabled={isSubmitting || draft.trim().length === 0}
        className="h-10 w-10 rounded-full text-white hover:bg-slate-800"
      >
        <PaperAirplaneIcon className="h-4 w-4" />
      </Button>
    </form>
  );
}
