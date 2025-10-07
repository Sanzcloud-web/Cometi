import { SparklesIcon } from './icons';

export function AppHeader(): JSX.Element {
  return (
    <header className="sticky top-0 z-10 border-b border-white/60 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 text-lg font-semibold text-white shadow-[0_12px_30px_-18px_rgba(16,185,129,0.75)]">
            C
          </div>
          <div className="space-y-0.5">
            <p className="text-base font-semibold text-slate-900">Cometi Assistant</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Naviguez à la vitesse de la pensée</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_25px_-15px_rgba(15,23,42,0.8)] transition hover:bg-slate-800"
        >
          <SparklesIcon className="h-4 w-4" />
          Nouvelle note
        </button>
      </div>
    </header>
  );
}
