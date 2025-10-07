import type { FormEvent } from 'react';
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
  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <Textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Écris quelque chose..."
        className="min-h-[3rem] flex-1 border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
        disabled={isSubmitting}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <Button type="submit" disabled={isSubmitting || draft.trim().length === 0} className="h-10 gap-2 px-4">
        <PaperAirplaneIcon className="h-4 w-4" />
        Envoyer
      </Button>
    </form>
  );
}
