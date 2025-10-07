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
      className="group relative flex min-h-[4.5rem] items-end gap-3 rounded-2xl border border-[#D6E4FF] bg-[#F1F6FF] p-4 shadow-sm transition focus-within:border-[#A8C7FF] focus-within:ring-2 focus-within:ring-[#D7E5FF]"
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
        className="max-h-64 flex-1 resize-none border-none bg-transparent px-0 py-0 text-[0.95rem] leading-relaxed text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-0 shadow-none"
        disabled={isSubmitting}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        style={{ overflowY: 'hidden' }}
      />
      <Button
        type="submit"
        variant="ghost"
        aria-label="Envoyer le message"
        disabled={isSubmitting || draft.trim().length === 0}
        className="h-11 w-11 rounded-xl bg-[#5B8CFF] text-white shadow transition hover:bg-[#4A7FF1] focus-visible:ring-[#5B8CFF] focus-visible:ring-offset-0"
      >
        <PaperAirplaneIcon className="h-4 w-4" />
      </Button>
    </form>
  );
}
