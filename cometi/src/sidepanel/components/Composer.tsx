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
    <footer className="border-t border-slate-200 bg-white/95 px-4 py-6 shadow-inner backdrop-blur">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-lg transition"
      >
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>Pose une question…</span>
          <span className="text-emerald-500">Ctrl + Enter pour envoyer</span>
        </div>
        <div className="flex items-end gap-3">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={1}
            placeholder="Écris ta demande ici…"
            className="h-12 flex-1 resize-none border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
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
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-emerald-200 hover:text-emerald-600"
              aria-label="Activer le micro"
            >
              <MicrophoneIcon className="h-5 w-5" />
            </button>
            <button
              type="submit"
              disabled={isSubmitting || draft.trim().length === 0}
              className="flex h-12 items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300/70"
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
