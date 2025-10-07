import { SparklesIcon, PlusIcon, BookmarkIcon } from './icons';

export function AppHeader(): JSX.Element {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-base font-semibold text-white shadow-sm">
            C
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Assistant</p>
            <p className="text-xs text-slate-500">Piloté par Cometi</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-600"
          >
            <SparklesIcon className="h-4 w-4" />
            Nouvel onglet
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-emerald-200 hover:text-emerald-600"
            aria-label="Créer"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-emerald-200 hover:text-emerald-600"
            aria-label="Sauvegarder"
          >
            <BookmarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
