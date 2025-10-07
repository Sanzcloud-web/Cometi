import type { FormEvent } from 'react';
import { MicrophoneIcon, PaperAirplaneIcon } from './icons';

type ComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
};

export function Composer({ draft, onDraftChange, onSubmit, isSubmitting }: ComposerProps): JSX.Element {
  return (
    <footer className="border-t border-white/60 bg-white/85 px-4 py-6 backdrop-blur-xl">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-[32px] border border-white/70 bg-white/80 p-5 shadow-[0_25px_70px_-50px_rgba(15,23,42,0.55)] backdrop-blur"
      >
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">
          <span>Exprime-toi librement</span>
          <span className="text-emerald-500">⌘ Entrée</span>
        </div>
        <div className="flex items-end gap-4">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={1}
            placeholder="Décris ton objectif…"
            className="h-14 flex-1 resize-none border-none bg-transparent text-[15px] text-slate-700 outline-none placeholder:text-slate-400"
            disabled={isSubmitting}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/80 text-slate-500 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.6)] transition hover:text-emerald-600"
              aria-label="Activer le micro"
            >
              <MicrophoneIcon className="h-5 w-5" />
            </button>
            <button
              type="submit"
              disabled={isSubmitting || draft.trim().length === 0}
              className="flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white shadow-[0_20px_45px_-35px_rgba(15,23,42,0.9)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-700/60"
            >
              <PaperAirplaneIcon className="mr-2 h-4 w-4" />
              Envoyer
            </button>
          </div>
        </div>
      </form>
    </footer>
  );
}
